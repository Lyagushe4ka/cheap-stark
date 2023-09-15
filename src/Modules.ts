import { Account, CallData, CommonTransactionReceiptResponse, Contract, InvokeFunctionResponse, RpcProvider, cairo, uint256 } from "starknet";
import { calculateArgentxAddress, calculateBraavosAddress } from "./StarkHelpers";
import { STARKNET_RPC_URL } from "../DEPENDENCIES";
import erc20Abi from './ABI/erc20ABI.json'
import routerAbi from './ABI/routerABI.json'
import zklendAbi from './ABI/zklendAbi.json'
import { DECIMALS, DMAIL_ROUTER_ADDRESS, STARK_ETH_ADDRESS, TOKENS } from "./Constants";
import { randomBetween, retry } from "./Helpers";
import { BigNumber, ethers } from "ethers";


const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });


export async function sendMessage(
  privateKey: string,
  isArgent: boolean,
  theme: string,
  email: string,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const account = new Account(provider, address, privateKey);
  const etherInstance = new Contract(erc20Abi, TOKENS["ETH"], account);
  const routerInstance = new Contract(routerAbi, DMAIL_ROUTER_ADDRESS, account);

  const etherBalance = await retry<any>(() => etherInstance.balanceOf(account.address));

  let invokeFee;
  try {
    invokeFee = await retry(() => account.estimateInvokeFee(
      {
        contractAddress: DMAIL_ROUTER_ADDRESS,
        entrypoint: "transaction",
        calldata: CallData.compile({ to: email, theme: theme }),
      }
    ));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (invokeFee.suggestedMaxFee > (uint256.uint256ToBN(etherBalance.balance))) {
    return {
      result: false,
    }
  }

  console.log('sending transaction')
  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => routerInstance.transaction(
      email,
      theme,
    ));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  console.log('waiting for transaction')
  let receipt: CommonTransactionReceiptResponse;
  try {
    receipt = await retry(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!receipt.transaction_hash) {
    return {
      result: false,
    }
  }

  return {
    result: true,
    txHash: receipt.transaction_hash,
    totalPrice: +ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)),
  }
}

export async function enableCollateral(
  privateKey: string,
  isArgent: boolean,
  tokenName: string,
  enable: boolean = true,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {

  const router = '0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05';
  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const account = new Account(provider, address, privateKey);
  const etherInstance = new Contract(erc20Abi, STARK_ETH_ADDRESS, account);
  const routerInstance = new Contract(zklendAbi, router, account);

  const enableCall = {
    contractAddress: routerInstance.address,
    entrypoint: enable ? "enable_collateral" : "disable_collateral",
    calldata: CallData.compile({
      token: TOKENS[tokenName],
    })
  }

  const etherBalance = await retry<any>(() => etherInstance.balanceOf(account.address));

  let invokeFee;
  try {
    invokeFee = await retry(() => account.estimateInvokeFee(
      [enableCall],
    ));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (invokeFee.suggestedMaxFee > (uint256.uint256ToBN(etherBalance.balance))) {
    return {
      result: false,
    }
  }

  console.log('sending transaction')
  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => account.execute([enableCall]));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!tx) {
    return {
      result: false,
    }
  }

  console.log('waiting for transaction')
  let receipt: CommonTransactionReceiptResponse;
  try {
    receipt = await retry(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!receipt.transaction_hash) {
    return {
      result: false,
    }
  }

  return {
    result: true,
    txHash: receipt.transaction_hash,
    totalPrice: +ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)),
  }
}

export async function isCollateralEnabled(
  privateKey: string,
  isArgent: boolean,
  tokenName: string,
): Promise<boolean> {
  const router = '0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05';
  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const signer = new Account(provider, address, privateKey);
  const routerInstance = new Contract(zklendAbi, router, signer);

  const isCollateralEnabled = await retry<any>(() => routerInstance.is_collateral_enabled(
    signer.address,
    TOKENS[tokenName]
  ));

  return Number(isCollateralEnabled.enabled) === 1 ? true : false;
}

const ABI = [{
  "name": "mint",
  "type": "function",
  "inputs": [
    {
      "name": "starknet_id",
      "type": "felt"
    }
  ],
  "outputs": []
},];

export async function mintStarkId(
  privateKey: string,
  isArgent: boolean,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  let totalPrice = 0;

  const router = '0x05dbdedc203e92749e2e746e2d40a768d966bd243df04a6b712e222bc040a9af';
  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const signer = new Account(provider, address, privateKey);
  console.log('signer', signer.address);
  const routerInstance = new Contract(ABI, router, signer);

  const number = randomBetween(100000000000, 999999999999, 0);

  const swapCall = {
    contractAddress: routerInstance.address,
    entrypoint: "mint",
    calldata: CallData.compile({
      starknet_id: number,
    })
  }

  const calls = [swapCall];

  console.log('sending transaction')
  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => signer.execute(calls));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!tx) {
    return {
      result: false,
    }
  }

  let receipt: CommonTransactionReceiptResponse;
  try {
    receipt = await retry(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!receipt.transaction_hash) {
    return {
      result: false,
    }
  }
  
  totalPrice += Number(ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)));

  return {
    result: true,
    txHash: receipt.transaction_hash,
    totalPrice,
  }
}

export async function carmineStakeToken(
  privateKey: string,
  isArgent: boolean,
  tokenName: string,
  amountInToken: number,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  let totalPrice = 0;

  if (!['ETH', 'USDC'].includes(tokenName)) {
    console.log('token not supported');
    return {
      result: false,
    }
  }

  const abi = [
    {
      "name": "deposit_liquidity",
      "type": "function",
      "inputs": [
        {
          "name": "pooled_token_addr",
          "type": "felt"
        },
        {
          "name": "quote_token_address",
          "type": "felt"
        },
        {
          "name": "base_token_address",
          "type": "felt"
        },
        {
          "name": "option_type",
          "type": "felt"
        },
        {
          "name": "amount",
          "type": "Uint256"
        }
      ],
      "outputs": []
    },
  ]

  const router = '0x076dbabc4293db346b0a56b29b6ea9fe18e93742c73f12348c8747ecfc1050aa';
  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const signer = new Account(provider, address, privateKey);
  console.log('signer', signer.address);
  const tokenInstance = new Contract(erc20Abi, TOKENS[tokenName], signer);
  const routerInstance = new Contract(abi, router, signer);



  
  const amountInWei = cairo.uint256(ethers.utils.parseUnits(amountInToken.toFixed(6), DECIMALS[tokenName]).toString());
  

  const balance = await retry<any>(() => tokenInstance.balanceOf(signer.address));

  if (uint256.uint256ToBN(balance.balance) < uint256.uint256ToBN(amountInWei)) {
    return {
      result: false,
    }
  }

  const allowance = await retry<any>(() => tokenInstance.allowance(signer.address, router));

  if (!allowance) {
    return {
      result: false,
    }
  }

  const approveCall = {
    contractAddress: tokenInstance.address,
    entrypoint: "approve",
    calldata: CallData.compile({
      spender: routerInstance.address,
      amount: amountInWei,
    })
  }

  const swapCall = {
    contractAddress: routerInstance.address,
    entrypoint: "deposit_liquidity",
    calldata: CallData.compile({
      pooled_token_addr: TOKENS[tokenName],
      quote_token_address: TOKENS.USDC,
      base_token_address: TOKENS.ETH,
      option_type: tokenName === 'ETH' ? 0 : 1,
      amount: amountInWei,
    })
  }


  const calls = [swapCall];

  if (uint256.uint256ToBN(allowance.remaining) < uint256.uint256ToBN(amountInWei)) {
    calls.unshift(approveCall);
  }

  console.log('sending transaction')
  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => signer.execute(calls));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!tx) {
    return {
      result: false,
    }
  }

  console.log('waiting for transaction')
  let receipt: CommonTransactionReceiptResponse;
  try {
    receipt = await retry(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!receipt.transaction_hash) {
    return {
      result: false,
    }
  }
  
  totalPrice += Number(ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)));

  return {
    result: true,
    txHash: receipt.transaction_hash,
    totalPrice,
  }
}

export async function makeEthApprove(
  privateKey: string,
  isArgent: boolean,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  let totalPrice = 0;

  const router = '0x051734077ba7baf5765896c56ce10b389d80cdcee8622e23c0556fb49e82df1b';
  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const signer = new Account(provider, address, privateKey);
  console.log('signer', signer.address);
  const etherInstance = new Contract(erc20Abi, TOKENS.ETH, signer);

  const number = randomBetween(0.00001, 0.001, 6);

  const amountInWei = cairo.uint256(ethers.utils.parseEther(number.toString()).toString());

  const swapCall = {
    contractAddress: etherInstance.address,
    entrypoint: "increaseAllowance",
    calldata: CallData.compile({
      spender: router,
      added_value: amountInWei,
    })
  }

  const calls = [swapCall];

  console.log('sending transaction')
  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => signer.execute(calls));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!tx) {
    return {
      result: false,
    }
  }

  let receipt: CommonTransactionReceiptResponse;
  try {
    receipt = await retry(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!receipt.transaction_hash) {
    return {
      result: false,
    }
  }
  
  totalPrice += Number(ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)));

  return {
    result: true,
    txHash: receipt.transaction_hash,
    totalPrice,
  }
}

export async function mintStarkverse(
  privateKey: string,
  isArgentx: boolean,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  let totalPrice = 0;

  const STARKVERSE_ROUTER = '0x060582df2cd4ad2c988b11fdede5c43f56a432e895df255ccd1af129160044b8';
  const STARKVERSE_ABI = [{
    "name": "publicMint",
    "type": "function",
    "inputs": [
      {
        "name": "to",
        "type": "felt"
      }
    ],
    "outputs": []
  },];

  const signer = new Account(provider, isArgentx ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey), privateKey);
  console.log('signer', signer.address);
  const routerInstance = new Contract(STARKVERSE_ABI, STARKVERSE_ROUTER, signer);

  const swapCall = {
    contractAddress: routerInstance.address,
    entrypoint: "publicMint",
    calldata: [
      signer.address,
    ]
  }

  const calls = [swapCall];

  console.log('sending transaction')
  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => signer.execute(calls));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!tx) {
    return {
      result: false,
    }
  }

  let receipt: CommonTransactionReceiptResponse;
  try {
    receipt = await retry(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!receipt.transaction_hash) {
    return {
      result: false,
    }
  }
  
  totalPrice += Number(ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)));

  return {
    result: true,
    txHash: receipt.transaction_hash,
    totalPrice,
  }
}

export async function evolve(
  privateKey: string,
  isArgentx: boolean,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  let totalPrice = 0;

  const ROUTER = '0x06a05844a03bb9e744479e3298f54705a35966ab04140d3d8dd797c1f6dc49d0';
  const ABI = [
    {
      "name": "evolve",
      "type": "function",
      "inputs": [
        {
          "name": "game_id",
          "type": "felt"
        }
      ],
      "outputs": []
    },
  ]

  const signer = new Account(provider, isArgentx ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey), privateKey);
  console.log('signer', signer.address);
  const routerInstance = new Contract(ABI, ROUTER, signer);

  const swapCall = {
    contractAddress: routerInstance.address,
    entrypoint: "evolve",
    calldata: [
      '39132555273291485155644251043342963441664',
    ]
  }

  const calls = [swapCall];

  console.log('sending transaction')
  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => signer.execute(calls));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!tx) {
    return {
      result: false,
    }
  }

  let receipt: CommonTransactionReceiptResponse;
  try {
    receipt = await retry(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
    return {
      result: false,
    }
  }

  if (!receipt.transaction_hash) {
    return {
      result: false,
    }
  }
  
  totalPrice += Number(ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)));

  return {
    result: true,
    txHash: receipt.transaction_hash,
    totalPrice,
  }
}