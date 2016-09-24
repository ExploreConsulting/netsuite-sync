
/**
 * Provides access to netsuite file cabinet. This is intended to allow commandline driven suitescript file sync
 * so that we don't have to do it manually through the UI anymore.
 * NetSuite WSDL is at https://webservices.netsuite.com/wsdl/v2014_2_0/netsuite.wsdl as of this writing
 */

var _ = require("lodash");
var xml2js = require('xml2js');
var xmlparser = new xml2js.Parser({
    tagNameProcessors: [xml2js.processors.stripPrefix], // remove namespace prefixes foo:bar => bar
    attrNameProcessors: [xml2js.processors.stripPrefix],
    explicitArray: false, // only create arrays if needed
    mergeAttrs: true // put attributes on the parent element rather than a child object ($)
});
var debug = require('debug')('ns');
var request = require("request"); // basic HTTP
var path = require("path"); // file paths
var fs = require("fs"); // IO
var secureConfig = require("./SecureConfigFile");
var nsConf;
// the netsuite config defines the 'nsConf' variable and this program assumes the config file is already encrypted
function init() { nsConf = eval(secureConfig.decryptFile("NetSuiteConfig.js.enc")); }

//if (!nsConf) throw Error("nsConf variable does not exist - likely a problem with your NetSuiteConfig encrypted" +
//" config file because that is where the [nsConf] variable should be defined!");

/**
 * Creates SOAP xml using the common soap header and the given body template + body data
 * @param bodyTemplateFilename XML template to merge with data
 * @param data data to merge into the template
 * @returns string of entire soap message
 */
function makeSoapMsg(bodyTemplateFilename, data) {
    debug('making SOAP')
    // header is fixed
    var headerTempl = path.resolve(__dirname, "SoapHeader.xml");
    var headerContent = fs.readFileSync(headerTempl, {encoding: 'utf-8'});

    var bodyContent = fs.readFileSync(path.resolve(__dirname, bodyTemplateFilename), {encoding: 'utf-8'});

    // create a request with the header and our soap body based on the global netsuite config
    var requestData = _.extend(nsConf, {soapBody: _.template(bodyContent)(data)});
    debug('requestData', requestData)
    return _.template(headerContent)(requestData);
}

/**
 * Invokes the web service and returns the response
 * @param soapaction
 * @param soapRequest
 * @param callback callback function called with 3 arguments
 * error, response, body
 */
function invokeWebService(soapaction, soapRequest, callback) {
    var opts = {
        uri: nsConf.endpoint,
        headers: {SOAPAction: soapaction},
        body: soapRequest
    };
    request.post(opts, callback);
}

/**
 * Converts a docFileCab:File XML response from NS to a local file
 * @param xml entire SOAP envelope response from NS
 */
function saveFileCabinetResponseXMLtoFile(xml) {
    var record = xml.Envelope.Body.getResponse.readResponse.record;
    fs.writeFileSync(record.name, record.content, {endcoding: 'base64'});
    console.log(JSON.stringify(record));
}


function hasFault(soapxml) {
    if (soapxml.Envelope.Body.Fault) {
        return JSON.stringify(soapxml.Envelope.Body.Fault);
    }
}

/**
 * Checks a soap message for NetSuite's standard status success/failure response
 * @param soapxml the soap xml message
 * @returns boolean true if the message indicates success status
 */
function ensureReadResponseStatusSuccess(soapxml, callback) {
    var fault = hasFault(soapxml);
    if (fault) {
        console.log (fault);
        return false;
    }
    else return soapxml.Envelope.Body.getResponse.readResponse.status.isSuccess === "true";
}

/**
 * GET record operation
 * @param recordType netsuite record type
 * @param callback gets (error, http response, body) as parameters
 * @param internalid internal id of the desired record
 */
module.exports.get = function (recordType, internalid, callback) {
    init();
    var nsRequest = makeSoapMsg("getTemplate.xml", {internalId: internalid, type: recordType});
    invokeWebService("get", nsRequest, callback);
};

/**
 * Retrieves the given file by internal id and saves it
 * @param internalid
 * @param callback
 */
module.exports.getFile = function (internalid, destinationPath, callback) {
    init();
    destinationPath = destinationPath || ".";
    module.exports.get("file", internalid, function (err, response, xmlbody) {
        // save the body as a file in the current directory
        xmlparser.parseString(xmlbody, function (err, result) {
            if (!err) {
                if (!ensureReadResponseStatusSuccess(result)) return callback(result);

                var record = result.Envelope.Body.getResponse.readResponse.record;
                fs.writeFileSync(record.name, record.content, 'base64');
                console.log(JSON.stringify(record));
            }
            if (callback)  return callback(err, result);
        })
    });
};


/**
 * Gets the config info it can from netsuite's 'rest' api (e.g. service uri, ns account#, etc.)
 * @param {string} email user's email for login
 * @param {string} password password used for login
 * @param {boolean} isSandbox true if you want to retrieve info for a sandbox account
 * @returns {Promise} where rejection will receive (error,response) else will receive (err,response, body)
 * from NS
 */
module.exports.discoverConfigInfo = function (email, password, isSandbox) {
    var targetHost = isSandbox ? 'https://rest.sandbox.netsuite.com' : 'https://rest.netsuite.com';
    var options = {
        url: targetHost + '/rest/roles',
        headers: {
            'Authorization': 'NLAuth nlauth_email=' + email + ',nlauth_signature=' + password
        }
    };

    return new Promise( function(resolve,reject){
        request.get(options, function(error,response,body) {
            if (!error && response.statusCode == 200) resolve({response:response,body:body});
            else reject({ error:error, response: response});
        });
    });
};

module.exports.search = function () {
    init();
    var nsRequest = makeSoapMsg("getTemplate.xml", {internalId: internalid, type: recordType});
    invokeWebService("get", nsRequest, callback);
};

/**
 * Sends a file to NetSuite to the configured folder, overwriting if the file exists.
 * @param filename local file (e.g. EC_UserEventFoo.js)
 * @param [description] optional description of the file, shown in netsuite ui
 * @param folder
 * @param {function(err,resp,body)} callback function to receive the error or successful response from NS
 */
module.exports.postFile = function (filename, description, folder, callback) {
    init();
    add(filename, description, folder, function (err, resp, body) {
        // save the body as a file in the current directory
        xmlparser.parseString(body, function (err, result) {
            return callback(err,result);
        });
    });
};

/**
 * Adds ta file to the file cabinet. This is a low level call.
 * @param filename full path to the file you want to send
 * @param description file description you'd like to have appear in NS
 * @param folder internalid of the folder in which to place the file
 * @param callback receives results of the web service call
 */
function add(filename, description, folder, callback) {
    var content = fs.readFileSync(filename, {encoding: 'base64'});
    var nsRequest = makeSoapMsg("addFileTemplate.xml", {
        folderid: folder || nsConf.folderid,
        filename:path.basename(filename),
        content:content,
        description:description
    });

    // console.log(nsRequest);
    invokeWebService("add", nsRequest, callback);
};
