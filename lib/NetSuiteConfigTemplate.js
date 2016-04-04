/**
 * Copy this file to NetSuiteConfig.js and adjust for the NS customer you're connecting to.
 * Then run ns --encrypt-config. It creates and encrypted version (.enc). Once you confirm it all works (you
 * can send a file to NS) delete NetSuiteConfig.js so you don't have user credentials sitting on your computer.
 */
module.exports = {
    // netsuite account number
    "account": "<%=account%>",
    // netsuite login
    "email": "<%=email%>",
    "password": "<%=password%>",
    // can leave this set to null if a default role is defined, otherwise specify netsuite role id here
    "role": "<%=role%>",
    // web services endpoint, e.g. https://webservices.na1.netsuite.com
    "endpoint": "<%=webserviceshost%>/services/NetSuitePort_2014_2",
    // internal id of the base folder to which we add files
    // this should tbe the "ExploreConsulting" folder internal id for the NS customer
    "folderid": "<%= folderid%>"
};