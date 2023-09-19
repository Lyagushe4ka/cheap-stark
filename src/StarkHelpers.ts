import { Account, ec, hash, Contract, uint256, CallData, RpcProvider, InvokeFunctionResponse, CommonTransactionReceiptResponse, DeployContractResponse, GetTransactionReceiptResponse, num, Calldata, CairoVersion, AllowArray, Call } from "starknet";
import { getRate, randomBetween, retry, sleep } from "./Helpers";
import { BigNumber, ethers } from "ethers";
import { AX_ACCOUNT_CLASS_HASH, AX_PROXY_CLASS_HASH, TOKENS, DECIMALS, STARK_ETH_ADDRESS, BraavosInitialClassHash, BraavosProxyClassHash, StarkAccountData, AX_ACCOUNT_CLASS_HASH_CAIRO_1, StarknetAccount } from "./Constants";
import { MAX_AMOUNT_TO_KEEP, MIN_AMOUNT_TO_KEEP, STARKNET_RPC_URL } from "../DEPENDENCIES";
import erc20Abi from './ABI/erc20ABI.json'


const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });

const calcBraavosInit = (starkKeyPubBraavos: string) =>
  CallData.compile({ public_key: starkKeyPubBraavos });
const BraavosProxyConstructor = (BraavosInitializer: Calldata) =>
  CallData.compile({
    implementation_address: BraavosInitialClassHash,
    initializer_selector: hash.getSelectorFromName('initializer'),
    calldata: [...BraavosInitializer],
  });

export function calculateBraavosAddress(privateKey: string): string {

  const starkKeyPubBraavos = ec.starkCurve.getStarkKey(num.toHex(privateKey));
  const BraavosInitializer = calcBraavosInit(starkKeyPubBraavos);
  const BraavosProxyConstructorCallData = BraavosProxyConstructor(BraavosInitializer);

  const address = hash.calculateContractAddressFromHash(
    starkKeyPubBraavos,
    BraavosProxyClassHash,
    BraavosProxyConstructorCallData,
    0
  );

  return address;
}

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

export async function getDeployedStarkentAccount(privateKey: string): Promise<StarkAccountData[]> {
  const accountOptions = [calculateArgentxAddress(privateKey), calculateBraavosAddress(privateKey)];
  const accounts: StarkAccountData[] = [];

  for (let i = 0; i < accountOptions.length; i++) {
    const account = new Account(provider, accountOptions[i], privateKey);
    let tries = 3;
    while (tries--) {
      try {
        await account.getNonce();
        accounts.push({
          type: i === 0 ? 'Argent' : 'Braavos',
          address: account.address,
        });
      } catch (e: any) {
        if (e.message === '20: Contract not found') {
          break;
        }
        await sleep({ seconds: 3 });
        continue;
      }
      break;
    }
  }

  return accounts;
}

export async function getStarknetBalances(
  privateKey: string,
  isArgent: boolean,
): Promise<Record<string, number>> {
  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const account = new Account(provider, address, privateKey);

  const balances: Record<string, number> = {};

  for (const token in TOKENS) {
    const tokenInstance = new Contract(erc20Abi, TOKENS[token], account);

    const balance = await retry<any>(() => tokenInstance.balanceOf(account.address));
    const balanceInWei = BigNumber.from(uint256.uint256ToBN(balance.balance).toString()); // balance in wei
    const formattedBalance = Number(ethers.utils.formatUnits(balanceInWei, DECIMALS[token]));

    balances[token] = formattedBalance;
  }

  return balances;
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

  const starkBalanceObj = await retry<any>(() => etherInstance.balanceOf(account.address));
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
 
  const deployFee = await retry(() => account.estimateAccountDeployFee(deployAccountPayload));

  const deployFeeInWei = BigNumber.from((deployFee.suggestedMaxFee).toString());
  totalPrice += Number(ethers.utils.formatEther(deployFeeInWei));

  console.log('starting account deploy')
  const tx = await retry(() => account.deployAccount(deployAccountPayload), 2, 10);

  console.log('waiting for deploy transaction')
  const receipt = await retry<DeployContractResponse>(() => provider.waitForTransaction(tx.transaction_hash));

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

export async function transferEth(
  privateKey: string,
  isArgent: boolean,
  cexAddress: string,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}> {
  let totalPrice = 0;

  const address = isArgent ? calculateArgentxAddress(privateKey) : calculateBraavosAddress(privateKey);
  const signer = new Account(provider, address, privateKey);
  console.log('signer', signer.address);
  const etherInstance = new Contract(erc20Abi, TOKENS.ETH, signer);

  // if (!validateChecksumAddress(cexAddress)) {
  //   console.log('invalid cex address');
  //   return {
  //     result: false,
  //   }
  // }

  const rate = await getRate('ETH');

  if (!rate) {
    return {
      result: false,
    }
  }

  const rndAmount = randomBetween(MAX_AMOUNT_TO_KEEP + 0.1, MIN_AMOUNT_TO_KEEP + 0.1, 2);
  const amountInWei = ethers.utils.parseEther((rndAmount / rate).toFixed(6));

  const balance = await retry<any>(() => etherInstance.balanceOf(signer.address));
  const balanceInWei = BigNumber.from(uint256.uint256ToBN(balance.balance).toString()); // balance in wei

  const amount = balanceInWei.sub(amountInWei);

  if (amount.lte(0)) {
    return {
      result: false,
    }
  }

  let tx: InvokeFunctionResponse;
  try {
    tx = await retry(() => etherInstance.transfer(
      cexAddress,
      uint256.bnToUint256(BigInt(amount.toString())),
    ));
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

export async function upgradeArgentAccount(
  privateKey: string,
): Promise<{
  result: boolean;
  txHash?: string;
  totalPrice?: number;
}>  {
  let totalPrice = 0;

  const account = new Account(provider, calculateArgentxAddress(privateKey), privateKey);

  const upgradeCall = {
    contractAddress: account.address,
    entrypoint: "upgrade",
    calldata: [
      AX_ACCOUNT_CLASS_HASH_CAIRO_1,
      '1',
      '0'
    ]
  }

  const calls = [upgradeCall];

  const tx = await starkExecuteCalls(account, calls);

  if (tx instanceof Error) {
    return {
      result: false,
    }
  }

  const receipt = await starkTxWaitingRoom(tx.transaction_hash);

  if (receipt instanceof Error) {
    return {
      result: false,
    }
  }
  
  totalPrice += Number(ethers.utils.formatEther(BigNumber.from(receipt.actual_fee)));

  return {
    result: true,
    totalPrice,
    txHash: receipt.transaction_hash,
  }
}

export async function getArgentCairoVersion(privateKey: string): Promise<CairoVersion | undefined> {

  const abi = [
    {
      "name": "getVersion",
      "type": "function",
      "inputs": [],
      "outputs": [
        {
          "name": "version",
          "type": "felt"
        }
      ],
      "stateMutability": "view"
    },
  ]

  const contract = new Contract(abi, calculateArgentxAddress(privateKey), provider);

  let tries = 3;
  while (tries--) {
    try {
      const version = await contract.getVersion();
      if (version.version === 206933536304n) { // > 3.0.0
        return '1';
      } else {
        return '0';
      }
    } catch (e: any) {
      await sleep({ seconds: 3 });
      continue;
    }
  }

  return undefined;
}

export async function starkCreateSigner(privateKey: string, specificAccountType?: StarknetAccount): Promise<Account | Error> {

  const starkWallets = await getDeployedStarkentAccount(privateKey);

  if (starkWallets.length === 0) {
    return new Error('No starknet accounts found');
  }

  let starkWallet: StarkAccountData | undefined = starkWallets[0];
  if (specificAccountType) {
    starkWallet = starkWallets.find(w => w.type === specificAccountType);

    if (!starkWallet) {
      return new Error(`No ${specificAccountType} starknet accounts found`);
    }
  }

  let version: CairoVersion | undefined;
  if (starkWallet.type === 'Argent') {
    version = await getArgentCairoVersion(privateKey);
    if (!version) {
      return new Error('Could not get Argent Cairo version');
    }
  }

  const signer = new Account(provider, starkWallet.address, privateKey, version);

  return signer;
}

export async function starkTxWaitingRoom(txHash: string, tries = 6, interval = 3): Promise<GetTransactionReceiptResponse | Error> {

  let receipt: GetTransactionReceiptResponse | undefined;
  while (!receipt && --tries) {
    receipt = await Promise.race([
      provider.waitForTransaction(txHash),
      sleep({ minutes: interval }),
    ])
  }

  if (!receipt || !receipt.transaction_hash) {
    return new Error('Could not get transaction receipt');
  }

  return receipt;
}

export async function starkExecuteCalls(
  signer: Account,
  callsArray: AllowArray<Call>,
  errorsArray?: Array<string>
): Promise<InvokeFunctionResponse | Error> {

  const nonce = await signer.getNonce();

  let tx: InvokeFunctionResponse | undefined;
  let tries = 3;
  while (!tx && --tries) {
    try {
      tx = await signer.execute(callsArray, undefined, { nonce });
    } catch (e: any) {
      if (e.message.includes('nonce')) {
        return new Error('Could not parse nonce');
      }
      if (errorsArray && errorsArray.some(err => e.message.includes(err))) {
        return new Error(e.message);
      }
      continue;
    }
  }

  if (!tx) {
    return new Error('Tx execution failed');
  }

  return tx;
}