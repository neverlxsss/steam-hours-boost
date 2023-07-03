import SteamUser from 'steam-user';
import { promises as fs } from 'fs';
import fsExists from 'fs.promises.exists'
import path from 'path';

import { createSession } from './weblogon.js';
import { sleep } from './common.js';


const tokensFolder = `${path.resolve(path.dirname(''))}/tokens`;

let clients = {};

process.on('uncaughtException', function (err) {
    console.error(err);
});

const createClient = async (login, password, secret = null, games = [], online = true) => {
    if (!login || !password) {
        console.log(login, password)
        console.log('Login and password are needed');

        return;
    }

    let client = new SteamUser();
    const fileExists = await fsExists(`${tokensFolder}/${login}.bin`);

    if (!fileExists) {
        const createSessionResult = await createSession(login, password, secret);
    }
    const refreshToken = (await fs.readFile(`${tokensFolder}/${login}.bin`)).toString();

    client.logOn({
        "refreshToken": refreshToken,
    });

    client.on('loggedOn', (details) => {
        client.setPersona(online ? SteamUser.EPersonaState.Online : SteamUser.EPersonaState.Offline);
        client.gamesPlayed(games);

        clients[login] = client;
    });

    client.on('error', async (e) => {
        delete clients[login];
        // Some error occurred during logon
        console.log(e);
    });
}

const main = async () => {
    const content = await fs.readFile(`${path.resolve(path.dirname(''))}/config.json`);
    const accounts = JSON.parse(content);

    while (true) {
        for (const user of accounts.users) {
            if (!Object.keys(clients).includes(user.login)) {
                console.log(`Creating ${user.login} client`)
                await createClient(user.login, user.password, user.secret, user.games, user.online);
            }
        }

        await sleep(10000);
        console.log("Running clients: ", Object.keys(clients).toString())
    }
}

main();