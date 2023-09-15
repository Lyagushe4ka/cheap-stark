import { shuffleArray, sendTelegramMessage, sleep, randomBetween } from "./Helpers";
import { calculateArgentxAddress, deployStarknetAccount, getStarknetBalances, getDeployedStarkentAccount, transferEth } from "./StarkHelpers";
import { ENABLE_MODULES, MAX_TRANSACTIONS_PER_WALLET, MAX_WAIT_TIME, MIN_WAIT_TIME, MOVE_TO_CEX } from "../DEPENDENCIES";
import { Data, TOKENS } from "./Constants";
import fs from 'fs';
import { carmineStakeToken, enableCollateral, evolve, isCollateralEnabled, makeEthApprove, mintStarkId, mintStarkverse, sendMessage } from "./Modules";


let data: Record<string, Data> = {};

async function main() {

  const pkArr = fs.readFileSync('keys.txt').toString().replaceAll('\r', '').split('\n');
  const cexAddresses = fs.readFileSync('cexAddressList.txt').toString().replaceAll('\r', '').split('\n');

  if (MOVE_TO_CEX) {
    if (pkArr.length !== cexAddresses.length) {
      throw new Error('Private keys and CEX addresses count mismatch');
    }
  }

  const pairs = pkArr.map((pk, i) => ({ pk, cexAddress: cexAddresses[i] }));

  const addressArr = pkArr.map(pk => calculateArgentxAddress(pk));


  const wordString = fs.readFileSync('wordlist.txt').toString();
  const wordList = wordString.replaceAll(/ +\r*\n*/g, ' ').split(' ');

  if (fs.existsSync('walletsData.json')) {
    data = JSON.parse(fs.readFileSync('walletsData.json').toString());
  }

  while (true) {

    if (pairs.length === 0) {
      console.log('No more private keys to use');
      await sendTelegramMessage(`🏁 NO MORE KEYS TO USE LEFT, SCRIPT IS FINISHED`);
      fs.writeFileSync('walletsData.json', JSON.stringify(data, null, 2));
      return;
    }

    const pair = shuffleArray(pairs)[0];
    const address = calculateArgentxAddress(pair.pk);

    let account = await getDeployedStarkentAccount(pair.pk);

    if (account.length === 0) {

      const deploy = await deployStarknetAccount(pair.pk);

      if (deploy.result) {
        console.log(`Deployed account: ${deploy.accountAddress}, tx: ${deploy.txHash}, fee: ${(deploy.totalPrice)?.toFixed(6)} ETH`);

        await sendTelegramMessage(`🔔 Deployed account: ${deploy.accountAddress}, tx: https://starkscan.co/tx/${deploy.txHash}, fee: ${(deploy.totalPrice)?.toFixed(6)} ETH`);

        await sleep({ minutes: 6 });
      } else {
        if (deploy.name === 'Transaction failed' || deploy.name === 'Zero balance') {
          console.log(`Error deploying account: ${deploy.name} for address: ${address}`);

          await sendTelegramMessage(`❌ Error deploying account: ${deploy.name} for address: ${address}`);

          continue;
        }
      }
    }

    account = await getDeployedStarkentAccount(pair.pk);

    console.log('Using address: ' + account[0].address + '\n');

    if (account.length === 0) {
      continue;
    }

    const argent = account[0].type === "Argent" ? true : false;

    if (data[address] && data[address].transactions && data[address].transactions! >= MAX_TRANSACTIONS_PER_WALLET) {
      console.log(`Max transactions reached for ${account[0].type} address: ${address}`);

      if (MOVE_TO_CEX) {
        const exit = await transferEth(
          pair.pk,
          argent,
          pair.cexAddress,
        )

        if (!exit.result) {
          console.log(`Error transfering funds to cex on ${account[0].type} address: ${address}`);
          
          await sendTelegramMessage(`❌ Error transfering funds to cex on ${account[0].type} address: ${address}`);
        } else {

          console.log(`Transfered funds to cex on ${account[0].type} address: ${address}, tx: ${exit.txHash}, fee: ${(exit.totalPrice)?.toFixed(6)} ETH`);

          await sendTelegramMessage(`✅ Transfered funds to cex on ${account[0].type} address: ${address}, tx: https://starkscan.co/tx/${exit.txHash}, fee: ${(exit.totalPrice)?.toFixed(6)} ETH`);
        }
      }

      await sendTelegramMessage(`🗑 Max transactions reached for ${account[0].type} address: ${address}, depositing on cex address: ${pair.cexAddress} and removing from list`);

      pairs.splice(pairs.indexOf(pair), 1);

      continue;
    }

    const totalisator = Math.random();

    let msg;
    if (totalisator < 0.2) {

      if (!ENABLE_MODULES.DMAIL) {
        continue;
      }

      console.log('Dmail transaction')

      // random number between 5 and 10
      const rnd = Math.floor(Math.random() * 6) + 5;
      const email = shuffleArray(addressArr)[0].slice(0, rnd) + '@dmail.ai';
      console.log('Sending message to: ' + email);
      // random number from 2 to 4
      const rndNum = Math.floor(Math.random() * 3) + 1;
      const theme = shuffleArray(wordList).slice(0, rndNum).join(' ');
      console.log('Theme: ' + theme);

      msg = await sendMessage(pair.pk, argent, theme, email);

      if (!msg.result) {
        // console.log(`Not enough funds for ${account[0].type} address: ${address}`);

        // await sendTelegramMessage(`🆘 Not enough funds for ${account[0].type} address: ${address}`);

        // pairs.splice(pairs.indexOf(pair), 1);

        continue;
      }

      console.log(`Sent message from ${account[0].type} ${address} to ${email}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Sent message from ${account[0].type} ${address} to ${email}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

    } else if (totalisator < 0.4 && totalisator >= 0.2) {

      if (!ENABLE_MODULES.ZKLEND_COLLATERAL) {
        continue;
      }

      console.log('Enabling/Disabling collateral')

      const token = shuffleArray(Object.keys(TOKENS))[0];
      const enable = await isCollateralEnabled(pair.pk, argent, token);

      msg = await enableCollateral(pair.pk, argent, token, !enable);

      if (!msg.result) {
        continue;
      }

      console.log(`${enable ? "Disabled" : "Enabled"} collateral for ${token} for ${account[0].type} address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ ${enable ? "Disabled" : "Enabled"} collateral for ${token} for ${account[0].type} address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

    } else if (totalisator >= 0.4 && totalisator < 0.6) {

      if (!ENABLE_MODULES.STARK_ID) {
        continue;
      }

      console.log('Minting stark id')

      msg = await mintStarkId(pair.pk, argent);

      if (!msg.result) {
        continue;
      }

      console.log(`Minted stark identity for ${account[0].type} address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Minted stark identity for ${account[0].type} address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

    } else if (totalisator >= 0.6 && totalisator < 0.7) {

      if (!ENABLE_MODULES.CARMINE) {
        continue;
      }

      console.log('Staking token on carmine')

      const balances = await getStarknetBalances(pair.pk, argent);

      const notZeroBalances = Object.keys(balances).filter(token => balances[token] !== 0);

      if (notZeroBalances.length === 0) {
        continue;
      }

      const token = shuffleArray(notZeroBalances)[0];
      const amount = balances[token] / 100 * randomBetween(1, 6, 0);

      msg = await carmineStakeToken(
        pair.pk,
        argent,
        token,
        amount,
      )

      if (!msg.result) {
        continue;
      }

      console.log(`Staked ${amount.toFixed(6)} of ${token} for ${account[0].type} address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Staked ${amount.toFixed(6)} of ${token} for ${account[0].type} address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);
    } else if (totalisator >= 0.7 && totalisator < 0.8) {

      if (!ENABLE_MODULES.UNFRAMED_BID) {
        continue;
      }

      console.log('Approving ETH for Unframed: NFT Marketplace')
      
      msg = await makeEthApprove(pair.pk, argent);

      if (!msg.result) {
        continue;
      }

      console.log(`Approved ETH for Unframed: NFT Marketplac on ${account[0].type} address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Approved ETH for Unframed: NFT Marketplac on ${account[0].type} address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);
    } else if (totalisator >= 0.8 && totalisator < 0.9) {

      if (!ENABLE_MODULES.STARKVERSE) {
        continue;
      }

      console.log('Minting starkverse');
      msg = await mintStarkverse(pair.pk, argent);

      if (!msg.result) {
        continue;
      }

      console.log(`Minted starkverse for ${account[0].type} address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Minted starkverse for ${account[0].type} address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);
    } else {

      if (!ENABLE_MODULES.GOL2_EVOLVE) {
        continue;
      }

      console.log('GOL2 evolve');
      msg = await evolve(pair.pk, argent);

      if (!msg.result) {
        continue;
      }

      console.log(`Evolved GOL2 for ${account[0].type} address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Evolved GOL2 for ${account[0].type} address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);
    }

    data[address] = {
      address,
      type: account[0].type,
      transactions: data[address]?.transactions ? data[address].transactions! + 1 : 1,
      fees: data[address]?.fees ? data[address].fees! + msg.totalPrice! : msg.totalPrice,
    };

    await sleep({ minutes: MIN_WAIT_TIME }, { minutes: MAX_WAIT_TIME });
  } 
}

// catching ctrl+c event
process.on('SIGINT', function() {
  console.log('Caught interrupt signal');

  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync('walletsData.json', jsonData);

  process.exit();
});

// catching unhandled promise rejection
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);

  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync('walletsData.json', jsonData);

  process.exit();
});

// catching uncaught exception
process.on('uncaughtException', (err, origin) => {
  console.log(`Caught exception: ${err}\n Exception origin: ${origin}`)

  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync('walletsData.json', jsonData);

  process.exit();
});

main();