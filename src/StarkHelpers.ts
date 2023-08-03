import { Account, ec, hash, Contract, uint256, CallData, RpcProvider, InvokeFunctionResponse, CommonTransactionReceiptResponse } from "starknet";
import { retry } from "./Helpers";
import { BigNumber, ethers } from "ethers";
import { AX_ACCOUNT_CLASS_HASH, AX_PROXY_CLASS_HASH, TOKENS, DECIMALS, DMAIL_ROUTER_ADDRESS } from "./Constants";
import { STARKNET_RPC_URL } from "../DEPENDENCIES";
import erc20Abi from './erc20ABI.json'
import routerAbi from './routerABI.json'


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

    const balance = await retry<any>(() => tokenInstance.balanceOf(account.address));
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

  const etherBalance = await retry<any>(() => etherInstance.balanceOf(account.address));

  const invokeFee = await account.estimateInvokeFee(
    {
      contractAddress: DMAIL_ROUTER_ADDRESS,
      entrypoint: "transaction",
      calldata: CallData.compile({ to: email, theme: theme }),
    }
  );
  console.log(`Suggested max fee: ${invokeFee.suggestedMaxFee}`);

  if (invokeFee.suggestedMaxFee > (uint256.uint256ToBN(etherBalance.balance))) {
    return {
      result: false,
    }
  }

  const tx = await retry<InvokeFunctionResponse>(() => routerInstance.transaction(
    email,
    theme,
  ));

  const receipt = await retry<CommonTransactionReceiptResponse>(() => provider.waitForTransaction(tx.transaction_hash));

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
