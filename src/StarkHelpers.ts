import { Account, ec, hash, Contract, uint256, CallData, RpcProvider, InvokeFunctionResponse, CommonTransactionReceiptResponse, DeployContractResponse, GetTransactionReceiptResponse, cairo } from "starknet";
import { randomBetween, retry } from "./Helpers";
import { BigNumber, ethers } from "ethers";
import { AX_ACCOUNT_CLASS_HASH, AX_PROXY_CLASS_HASH, TOKENS, DECIMALS, DMAIL_ROUTER_ADDRESS, STARK_ETH_ADDRESS } from "./Constants";
import { STARKNET_RPC_URL } from "../DEPENDENCIES";
import erc20Abi from './erc20ABI.json'
import routerAbi from './routerABI.json'
import zklendAbi from './zklendABI.json'


const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });

export function calculateArgentxAddress(privateKey: string): string {

  const starkPublicKeyAX = ec.starkCurve.getStarkKey(privateKey);

  const AXproxyConstructorCallData = CallData.compile(
    {
      implementation: AX_ACCOUNT_CLASS_HASH,
      selector: hash.getSelectorFromName("initialize"),
      calldata: CallData.compile({ signer: starkPublicKeyAX, guardian: "0" }),
    }
  );

  const AXcontractAddress = hash.calculateContractAddressFromHash(
    starkPublicKeyAX,
    AX_PROXY_CLASS_HASH,
    AXproxyConstructorCallData,
    0,
  );

  return AXcontractAddress;
}

export async function getStarknetBalances(
  privateKey: string,
): Promise<Record<string, number>> {
  const account = new Account(provider, calculateArgentxAddress(privateKey), privateKey);

  const balances: Record<string, number> = {};

  for (const token in TOKENS) {
    const tokenInstance = new Contract(erc20Abi, TOKENS[token], account);

    const balance = await retry<any>(() => tokenInstance.balanceOf(account.address), 10, 90);
    const balanceInWei = BigNumber.from(uint256.uint256ToBN(balance.balance).toString()); // balance in wei
    const formattedBalance = Number(ethers.utils.formatUnits(balanceInWei, DECIMALS[token]));

    balances[token] = formattedBalance;
  }

  return balances;
}

export async function sendMessage(
  privateKey: string,
  theme: string,
  email: string,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {

  const account = new Account(provider, calculateArgentxAddress(privateKey), privateKey);
  const etherInstance = new Contract(erc20Abi, TOKENS["ETH"], account);
  const routerInstance = new Contract(routerAbi, DMAIL_ROUTER_ADDRESS, account);

  const etherBalance = await retry<any>(() => etherInstance.balanceOf(account.address), 10, 90);

  const invokeFee = await retry(() => account.estimateInvokeFee(
    {
      contractAddress: DMAIL_ROUTER_ADDRESS,
      entrypoint: "transaction",
      calldata: CallData.compile({ to: email, theme: theme }),
    }
  ), 10, 90);

  if (invokeFee.suggestedMaxFee > (uint256.uint256ToBN(etherBalance.balance))) {
    return {
      result: false,
    }
  }

  console.log('sending transaction')
  const tx = await retry<InvokeFunctionResponse>(() => routerInstance.transaction(
    email,
    theme,
  ), 10, 90);

  console.log('waiting for transaction')
  const receipt = await retry<CommonTransactionReceiptResponse>(() => provider.waitForTransaction(tx.transaction_hash), 10, 90);

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

export async function deployStarknetAccount(
  privateKey: string
): Promise<{
  result: boolean;
  name: string;
  accountAddress?: string;
  txHash?: string;
  totalPrice?: number;
}> {

  const account = new Account(provider, calculateArgentxAddress(privateKey), privateKey);
  const etherInstance = new Contract(erc20Abi, STARK_ETH_ADDRESS, provider);

  let totalPrice = 0;  

  let nonce: string | undefined = undefined;
  try {
    nonce = await account.getNonce();
  } catch (e: any) {
    if (e.message === '20: Contract not found') {
    } else {
      return {
        result: false,
        name: 'Already deployed'
      }
    }
  }

  if (nonce) {
    return {
      result: false,
      name: 'Already deployed'
    }
  }

  const starkBalanceObj = await retry<any>(() => etherInstance.balanceOf(account.address), 10, 90);
  const starkBal = BigNumber.from(uint256.uint256ToBN(starkBalanceObj.balance).toString()); // balance in wei

  if (starkBal.eq(0)) {
    return {
      result: false,
      name: 'Zero balance'
    }
  }
  const starkPublicKey = ec.starkCurve.getStarkKey(privateKey);

  const AXproxyConstructorCallData = CallData.compile(
    {
      implementation: AX_ACCOUNT_CLASS_HASH,
      selector: hash.getSelectorFromName("initialize"),
      calldata: CallData.compile({ signer: starkPublicKey, guardian: "0" }),
    }
  );

  const deployAccountPayload = {
    classHash: AX_PROXY_CLASS_HASH,
    constructorCalldata: AXproxyConstructorCallData,
    contractAddress: account.address,
    addressSalt: starkPublicKey,
  };
 
  const deployFee = await retry(() => account.estimateAccountDeployFee(deployAccountPayload), 10, 90);

  const deployFeeInWei = BigNumber.from((deployFee.suggestedMaxFee).toString());
  totalPrice += Number(ethers.utils.formatEther(deployFeeInWei));

  console.log('starting account deploy')
  const tx = await retry(() => account.deployAccount(deployAccountPayload), 10, 90);

  console.log('waiting for deploy transaction')
  const receipt = await retry<DeployContractResponse>(() => provider.waitForTransaction(tx.transaction_hash), 10, 90);

  if (!receipt.contract_address) {
    return {
      result: false,
      name: 'Transaction failed'
    }
  }
  
  return {
    result: true,
    name: 'Deployed',
    accountAddress: receipt.contract_address,
    txHash: receipt.transaction_hash,
    totalPrice: totalPrice,
  }
}

export async function enableCollateral(
  privateKey: string,
  tokenName: string,
  enable: boolean = true,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {

  const router = '0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05';
  const account = new Account(provider, calculateArgentxAddress(privateKey), privateKey);
  const etherInstance = new Contract(erc20Abi, STARK_ETH_ADDRESS, account);
  const routerInstance = new Contract(zklendAbi, router, account);

  const enableCall = {
    contractAddress: routerInstance.address,
    entrypoint: enable ? "enable_collateral" : "disable_collateral",
    calldata: CallData.compile({
      token: TOKENS[tokenName],
    })
  }

  const etherBalance = await retry<any>(() => etherInstance.balanceOf(account.address), 10, 90);

  const invokeFee = await retry(() => account.estimateInvokeFee(
    [enableCall]
  ), 10, 90);

  if (invokeFee.suggestedMaxFee > (uint256.uint256ToBN(etherBalance.balance))) {
    return {
      result: false,
    }
  }

  console.log('sending transaction')
  const tx = await retry<InvokeFunctionResponse>(() => account.execute([enableCall]), 10, 90);

  if (!tx) {
    return {
      result: false,
    }
  }

  console.log('waiting for transaction')
  const receipt = await retry<GetTransactionReceiptResponse>(() => provider.waitForTransaction(tx.transaction_hash), 10, 90);
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
  tokenName: string,
): Promise<boolean> {
  const router = '0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05';
  const signer = new Account(provider, calculateArgentxAddress(privateKey), privateKey);
  const routerInstance = new Contract(zklendAbi, router, signer);

  const isCollateralEnabled = await retry<any>(() => routerInstance.is_collateral_enabled(
    signer.address,
    TOKENS[tokenName]
  ), 10, 90);

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
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  let totalPrice = 0;

  const router = '0x05dbdedc203e92749e2e746e2d40a768d966bd243df04a6b712e222bc040a9af';
  const signer = new Account(provider, calculateArgentxAddress(privateKey), privateKey);
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

  const tx = await retry<InvokeFunctionResponse>(() => signer.execute(calls));

  if (!tx) {
    return {
      result: false,
    }
  }

  let receipt;
  try {
  receipt = await retry<GetTransactionReceiptResponse>(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
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
  tokenName: string,
  amountInToken?: number,
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
  const signer = new Account(provider, calculateArgentxAddress(privateKey), privateKey);
  console.log('signer', signer.address);
  const tokenInstance = new Contract(erc20Abi, TOKENS[tokenName], signer);
  const routerInstance = new Contract(abi, router, signer);



  
  const amountInWei = cairo.uint256(ethers.utils.parseUnits(amountInToken!.toString(), DECIMALS[tokenName]).toString());
  

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


  const tx = await retry<InvokeFunctionResponse>(() => signer.execute(calls));

  if (!tx) {
    return {
      result: false,
    }
  }

  let receipt;
  try {
  receipt = await retry<GetTransactionReceiptResponse>(() => provider.waitForTransaction(tx.transaction_hash));
  } catch (e: any) {
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