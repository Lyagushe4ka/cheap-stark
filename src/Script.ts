import { shuffleArray, sendTelegramMessage, sleep, randomBetween } from "./Helpers";
import { calculateArgentxAddress, sendMessage, deployStarknetAccount, isCollateralEnabled, enableCollateral, mintStarkId, carmineStakeToken, getStarknetBalances, makeEthApprove } from "./StarkHelpers";
import { MAX_TRANSACTIONS_PER_WALLET, MAX_WAIT_TIME, MIN_WAIT_TIME } from "../DEPENDENCIES";
import { Data, TOKENS } from "./Constants";
import fs from 'fs';


let data: Record<string, Data> = {};

async function main() {

  const pkArr = fs.readFileSync('keys.txt').toString().replaceAll('\r', '').split('\n');
  const addressArr = pkArr.map(pk => calculateArgentxAddress(pk));

  const wordString = fs.readFileSync('wordlist.txt').toString();
  const wordList = wordString.replaceAll(/ +\r*\n*/g, ' ').split(' ');

  if (fs.existsSync('walletsData.json')) {
    data = JSON.parse(fs.readFileSync('walletsData.json').toString());
  }

  while (true) {

    if (pkArr.length === 0) {
      console.log('No more private keys to use');
      await sendTelegramMessage(`🏁 NO MORE KEYS TO USE LEFT, SCRIPT IS FINISHED`);
      fs.writeFileSync('walletsData.json', JSON.stringify(data, null, 2));
      return;
    }

    const keys = shuffleArray(pkArr);
    const address = calculateArgentxAddress(keys[0]);
    console.log('Using address: ' + address + '\n');

    const deploy = await deployStarknetAccount(keys[0]);

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

    if (data[address] && data[address].transactions && data[address].transactions! >= MAX_TRANSACTIONS_PER_WALLET) {
      console.log('Max transactions reached for address: ' + address);

      await sendTelegramMessage(`🗑 Max transactions reached for address: ${address}, removing from list`);

      pkArr.splice(pkArr.indexOf(keys[0]), 1);

      continue;
    }

    const totalisator = Math.random();

    let msg;
    if (totalisator < 0.2) {

      // random number between 5 and 10
      const rnd = Math.floor(Math.random() * 6) + 5;
      const email = shuffleArray(addressArr)[0].slice(0, rnd) + '@dmail.ai';
      console.log('Sending message to: ' + email);
      // random number from 1 to 3
      const rndNum = Math.floor(Math.random() * 3) + 1;
      const theme = shuffleArray(wordList).slice(0, rndNum).join(' ');

      msg = await sendMessage(keys[0], theme, email);

      if (!msg.result) {
        console.log('Not enough funds for address: ' + address);

        await sendTelegramMessage(`🆘 Not enough funds for address: ${address}`);

        pkArr.splice(pkArr.indexOf(keys[0]), 1);

        continue;
      }

      console.log(`Sent message from ${address} to ${email}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Sent message from ${address} to ${email}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

    } else if (totalisator < 0.4 && totalisator >= 0.2) {

      const token = shuffleArray(Object.keys(TOKENS))[0];
      const enable = await isCollateralEnabled(keys[0], token);

      msg = await enableCollateral(keys[0], token, !enable);

      if (!msg.result) {
        continue;
      }

      console.log(`${enable ? "Disabled" : "Enabled"} collateral for ${token} for address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ ${enable ? "Disabled" : "Enabled"} collateral for ${token} for address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

    } else if (totalisator >= 0.4 && totalisator < 0.6) {

      msg = await mintStarkId(keys[0]);

      if (!msg.result) {
        continue;
      }

      console.log(`Minted stark identity for address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Minted stark identity for address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

    } else if (totalisator >= 0.6 && totalisator < 0.8) {

      const balances = await getStarknetBalances(keys[0]);

      const notZeroBalances = Object.keys(balances).filter(token => balances[token] !== 0);

      if (notZeroBalances.length === 0) {
        continue;
      }

      const token = shuffleArray(notZeroBalances)[0];
      const amount = balances[token] / 100 * randomBetween(1, 6, 0);

      msg = await carmineStakeToken(
        keys[0],
        token,
        amount,
      )

      if (!msg.result) {
        continue;
      }

      console.log(`Staked ${amount.toFixed(6)} of ${token} for address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Staked ${amount.toFixed(6)} of ${token} for address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);
    } else {
      
      msg = await makeEthApprove(keys[0]);

      if (!msg.result) {
        continue;
      }

      console.log(`Approved ETH for Unframed: NFT Marketplac on address: ${address}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

      await sendTelegramMessage(`✅ Approved ETH for Unframed: NFT Marketplac on address: ${address}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);
    }

    data[address] = {
      address,
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