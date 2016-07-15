#!/usr/bin/env node

// this is the console program

var fileCabinet  = require("./lib/FileCabinet");
var program      = require("commander");
var chalk        = require('chalk');
var secureConfig = require("./lib/SecureConfigFile");
var fs           = require('fs');
var path         = require('path');
var _            = require('lodash');
// this is one of the few libs I found that is compatible with the (linux) webstorm terminal
var readlineSync = require('readline-sync');
// custom debugger that logs only if environment variable DEBUG=ns
var debug = require('debug')('ns');

const CONFIG_FILE = 'NetSuiteConfig.js';


// configure the command line interface
program
    .version(require('./package.json').version)
    .option('-u, --upload <file>', "Upload file to NetSuite file cabinet")
    .option('-d, --desc description', "Description for uploaded file")
    .option('-f, --folder [value]', "Overrides the internal ID of the target folder for the uploaded file")
    .option('-e, --encrypt-config', "encrypts the config file using the NSPW environment variable (must" +
    " be set prior) as passphrase")
    .option('--decrypt-config', "decrypts the config file and displays the plaintext")
    .option('-c, --create-config', "displays a sample generic configuration which you save as " + CONFIG_FILE  +
    " then fill out and run the encrypt (-e) command")
    .option('-g, --gen-config', "Contacts NetSuite for config information and generates a config file so you don't " +
    "have to populate the config file entirely by hand")
    .on('--help', function () {
        console.log('Examples:');
        console.log();
        console.log('Generate (unencrypted) config file interactively:')
        console.log(chalk.inverse(' ns -g '))
        console.log();
        console.log('Upload a file to the folder set in the config file:')
        console.log(chalk.inverse(' ns -u EC_UserEvent.js '))
        console.log();
        console.log('run in debug mode (linux/osx)')
        console.log(chalk.inverse(' DEBUG=ns; ns -u EC_UserEvent.js '))
    })
    .parse(process.argv);

if (program.decryptConfig) {
    var plaintext = secureConfig.decryptFile(CONFIG_FILE + ".enc");
    console.log(plaintext);
    process.exit();
}


if (program.encryptConfig) {
    // only just prior to encrypt should the NetSuiteConfig.js file be cleartext
    var out = secureConfig.encryptFile(CONFIG_FILE);
    console.log("wrote file:" + out);
    process.exit();
}

if (program.upload) {
    fileCabinet.postFile(program.upload, program.desc, program.folder, function (err, resp) {

        if (err) throw err;

        var wr = resp.Envelope.Body.addResponse.writeResponse;
        if (wr.status.isSuccess == "true") {
            var successMsg = "File uploaded successfully as internalid " + wr.baseRef.internalId;
            console.log(chalk.green(successMsg));
        }
        else {
            var failMsg = "Problem uploading file" + JSON.stringify(wr);
            console.error(chalk.red(failMsg));
        }
    });
}

if (program.createConfig) {
    createConfig().then(console.log)
}

/**
 * creates a config file string, optionally data binding it
 * @param {{account, email, password, role, webserviceshost, folderid}} params data elements to inject into the template
 * @returns {Promise} promise to return the entire config file string
 */
function createConfig(params) {
    var configTemplate = path.join(__dirname, "lib/NetSuiteConfigTemplate.js");
    return new Promise(function (resolve, reject) {
        fs.readFile(configTemplate, function (err, template) {
            if (err) reject(err);
            else {
                if (params) template = _.template(template)(params);
                resolve(template.toString());
            }
        });
    });
}

if (program.genConfig) {
    console.log("Generating " + CONFIG_FILE + "...")
    console.log('Enter credentials to select account/role to use..')
    var username = readlineSync.question('Account login email:');
    var password = readlineSync.question('Account login password:');
    console.log('Enter the internal id of the folder to which files will be saved. If you do not set this it will' +
        ' default to zero and you must edit the config file manually to set the folder id value');
    var folder = readlineSync.question('Destination Folder Id:');
    var isSandbox = readlineSync.keyInYN('Sandbox Account?');

    fileCabinet.discoverConfigInfo(username, password,isSandbox)
        .then(function (result) {
            debug('Received body %s', result.body);
            var accountInfo = promptUserForAccountSelection(JSON.parse(result.body));
            if (!accountInfo) process.exit();
            debug('user selected %s', JSON.stringify(accountInfo, null, "  "));
            return createConfig({
                account: accountInfo.account.internalId,
                email: username,
                password: password,
                role: accountInfo.role.internalId,
                webserviceshost: accountInfo.dataCenterURLs.webservicesDomain,
                folderid: folder || 0
            })
        })
        .then(function(configData) {
            fs.writeFileSync(CONFIG_FILE, configData);
            console.log('wrote ' + CONFIG_FILE)
            var out = secureConfig.encryptFile(CONFIG_FILE);
            console.log("wrote " + out);
            console.log("don't forget to delete " + CONFIG_FILE + " after you've tested it's working!")
        })
        .catch(console.error)
}

/**
 * prompts the user to select an account+role
 * @param {Array.<{account, role}>} info JSON as returned from NS 'roles' api
 * @returns {{account,role,dataCenterURLs}} the account info object selected
 */
function promptUserForAccountSelection(info) {
    // create <Account Name> (Role Name) labels for the questions
    var questions = _.map(info, function (r) {
        return r.account.name + ' (' + r.role.name + ')'
    });
    var index     = readlineSync.keyInSelect(questions, 'Which NetSuite Account (Role) to use?')
    return info[index];
}