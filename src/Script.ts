import { shuffleArray, sendTelegramMessage, sleep } from "./Helpers";
import { calculateArgentxAddress, sendMessage } from "./StarkHelpers";
import { MAX_TRANSACTIONS_PER_WALLET, MAX_WAIT_TIME, MIN_WAIT_TIME } from "../DEPENDENCIES";
import { Data } from "./Constants";
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

    if (data[address] && data[address].transactions && data[address].transactions! >= MAX_TRANSACTIONS_PER_WALLET) {
      console.log('Max transactions reached for address: ' + address);

      await sendTelegramMessage(`🗑 Max transactions reached for address: ${address}, removing from list`);

      pkArr.splice(pkArr.indexOf(keys[0]), 1);

      continue;
    }

    // random number between 5 and 10
    const rnd = Math.floor(Math.random() * 6) + 5;
    const email = shuffleArray(addressArr)[0].slice(0, rnd) + '@dmail.ai';
    console.log('Sending message to: ' + email);
    // random number from 1 to 3
    const rndNum = Math.floor(Math.random() * 3) + 1;
    const theme = shuffleArray(wordList).slice(0, rndNum).join(' ');

    const msg = await sendMessage(keys[0], theme, email);

    if (!msg.result) {
      console.log('Not enough funds for address: ' + address);

      await sendTelegramMessage(`❌ Not enough funds for address: ${address}`);

      pkArr.splice(pkArr.indexOf(keys[0]), 1);

      continue;
    }

    console.log(`Sent message from ${address} to ${email}, tx: ${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

    await sendTelegramMessage(`✅ Sent message from ${address} to ${email}, tx: https://starkscan.co/tx/${msg.txHash}, fee: ${(msg.totalPrice)?.toFixed(6)} ETH`);

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