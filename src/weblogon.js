import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } from 'steam-session';
import { createInterface } from 'readline';
import { promises as fs } from 'fs';
import fsExists from 'fs.promises.exists'
import path from 'path';

import { sleep } from './common.js';


let g_AbortPromptFunc = null;
let result = null;
const tokensFolder = `${path.resolve(path.dirname(''))}/tokens`;

export const createSession = async (login, password, sharedSecret) => {
    if (!login || !password) {
        console.log('Login and password are needed');

        return false;
    }

    let community = new SteamCommunity();

    // Create a LoginSession for us to use to attempt to log into steam
    let session = new LoginSession(EAuthTokenPlatformType.SteamClient);

    // Go ahead and attach our event handlers before we do anything else.
    session.on('authenticated', async () => {
        let cookies = await session.getWebCookies();
        community.setCookies(cookies);

        const folderExists = await fsExists(tokensFolder);
        if (!folderExists) {
            await fs.mkdir(tokensFolder);
        }

        await fs.writeFile(`${tokensFolder}/${login}.bin`, session.refreshToken);
        console.log(`${login} session created`);
        result = true;
    });

    session.on('timeout', () => {
        console.log('This login attempt has timed out.');
        result = false;
    });

    session.on('error', (err) => {
        console.log(`ERROR: This login attempt has failed! ${err.message}`);
        result = false;
    });

    // Start our login attempt
    let startResult = await session.startWithCredentials({ accountName: login, password: password });

    if (startResult.actionRequired) {
        let codeActionTypes = [EAuthSessionGuardType.EmailCode, EAuthSessionGuardType.DeviceCode];
        let codeAction = startResult.validActions.find(action => codeActionTypes.includes(action.type));
        if (codeAction) {
            if (codeAction.type == EAuthSessionGuardType.EmailCode) {
                // We wouldn't expect this to happen since mobile confirmations are only possible with 2FA enabled, but just in case...
                console.log(`A code has been sent to your email address at ${codeAction.detail}.`);
            } else {
                console.log('You need to provide a Steam Guard Mobile Authenticator code.');
            }

            let code = null;
            if (!sharedSecret) {
                code = await promptAsync('Code or Shared Secret: ');
            } else {
                code = sharedSecret;
            }

            if (code) {
                // The code might've been a shared secret
                if (code.length > 10) {
                    code = SteamTotp.getAuthCode(code);
                }
                await session.submitSteamGuardCode(code);
            }

            // If we fall through here without submitting a Steam Guard code, that means one of two things:
            //   1. The user pressed enter without providing a code, in which case the script will simply exit
            //   2. The user approved a device/email confirmation, in which case 'authenticated' was emitted and the prompt was canceled
        }
    }

    while (result === null) {
        await sleep(1000);
    }

    return result;
}

function promptAsync(question, sensitiveInput = false) {
    return new Promise((resolve) => {
        let rl = createInterface({
            input: process.stdin,
            output: sensitiveInput ? null : process.stdout,
            terminal: true
        });

        g_AbortPromptFunc = () => {
            rl.close();
            resolve('');
        };

        if (sensitiveInput) {
            // We have to write the question manually if we didn't give readline an output stream
            process.stdout.write(question);
        }

        rl.question(question, (result) => {
            if (sensitiveInput) {
                // We have to manually print a newline
                process.stdout.write('\n');
            }

            g_AbortPromptFunc = null;
            rl.close();
            resolve(result);
        });
    });
}