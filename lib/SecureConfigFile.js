// This provides a primitive encrypt/decrypt for config files.
// The assumption is a config file is small so can be held easily in memory (i.e. not using streams)
var CryptoJS = require('crypto-js');
var fs = require('fs');

/**
 * Decrypts the given file using the provided passphrase else the value of the NSPW environment variable
 * @param {string} file
 * @param {string=} passphrase
 * @returns {string} decrypted contents of the file
 */
module.exports.decryptFile = function(file, passphrase) {
    var pass = passphrase || process.env.NSPW;
    if (!pass) throw new Error("passphrase must be specified or set as NSPW environment variable.");
    var encrypted = fs.readFileSync(file, {encoding: 'utf-8'});
    return CryptoJS.AES.decrypt(encrypted, pass).toString(CryptoJS.enc.Utf8);
};

/**
 * Encrypts the given file (replacing it on disk) using the provided passphrase
 * else the value of the NSPW environment variable
 * @param {string} file
 * @param {string=} passphrase
 * @returns {string} encrypted file name
 */
module.exports.encryptFile = function (file, passphrase) {
    var pass = passphrase || process.env.NSPW;
    if (!pass) throw new Error("passphrase must be specified or set as NSPW environment variable.");
    var plaintext = fs.readFileSync(file, {encoding: 'utf-8'});
    var encrypted = CryptoJS.AES.encrypt(plaintext, pass);
    var outFilename = file + ".enc";
    fs.writeFileSync(outFilename,encrypted);
    return outFilename;
};