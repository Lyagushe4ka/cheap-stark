import fs from 'fs';
import { sendTelegramMessage, shuffleArray, sleep } from './Helpers';
import { getArgentCairoVersion, getDeployedStarkentAccount, upgradeArgentAccount } from './StarkHelpers';
import { MAX_WAIT_TIME, MIN_WAIT_TIME } from '../DEPENDENCIES';


let data: Record<string, boolean> = {};

async function main() {

  const pkArr = fs.readFileSync('keys.txt').toString().replaceAll('\r', '').split('\n');

  if (fs.existsSync('upgradeData.json')) {
    data = JSON.parse(fs.readFileSync('upgradeData.json').toString());
  }

  while (true) {
    if (pkArr.length === 0) {
      console.log('No more private keys to use');
      await sendTelegramMessage(`🏁 NO MORE KEYS TO USE LEFT, SCRIPT IS FINISHED`);
      return;
    }

    const pk = shuffleArray(pkArr)[0];

    let account = await getDeployedStarkentAccount(pk);

    if (account.length === 0 || account[0].type !== 'Argent') {
      console.log('Account not found or not Argent');
      pkArr.splice(pkArr.indexOf(pk), 1);
      continue;
    }

    const check = await getArgentCairoVersion(pk);

    if (!check) {
      console.log('Error checking if account is Argent');
      continue;
    } else if (check === '1') {
      console.log('Account is already upgraded');
      data = {
        ...data,
        [account[0].address]: true,
      };
      pkArr.splice(pkArr.indexOf(pk), 1);
      continue;
    }

    console.log('Upgrading account: ', account[0].address);

    const upgrade = await upgradeArgentAccount(pk);

    if (!upgrade.result) {
      console.log('Upgrade failed');
      data = {
        ...data,
        [account[0].address]: false,
      };
      continue;
    }

    console.log('Upgrade successful');

    await sendTelegramMessage(`✅ Succesdully upgraded account: ${account[0].address}, tx: https://starkscan.co/tx/${upgrade.txHash}, fee: ${(upgrade.totalPrice)?.toFixed(6)} ETH`);

    data = {
      ...data,
      [account[0].address]: true,
    };

    pkArr.splice(pkArr.indexOf(pk), 1);

    await sleep({ minutes: MIN_WAIT_TIME }, { minutes: MAX_WAIT_TIME });
  }
}

// catching ctrl+c event
process.on('SIGINT', function() {
  console.log('Caught interrupt signal');

  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync('upgradeData.json', jsonData);

  process.exit();
});

// catching unhandled promise rejection
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);

  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync('upgradeData.json', jsonData);

  process.exit();
});

// catching uncaught exception
process.on('uncaughtException', (err, origin) => {
  console.log(`Caught exception: ${err}\n Exception origin: ${origin}`)

  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync('upgradeData.json', jsonData);

  process.exit();
});

main();