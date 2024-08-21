/*global process*/

/**
 * Usage:
 *
 * npm install minimist express
 * node app.js [options]
 */

const options = require('minimist')(process.argv.slice(2));
const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const request = require('request');
const path = require('path');
const __DEV__ = process.env.NODE_ENV === 'development';

var key;
var cert;
var EQFILEMOUNTPT

// ENVIRONMENT
//tries to open Docker specific files if it failes it asumes non docker dev. and opens files relative to current location

try{
    const CERTFILEMOUNT = '/cert'
    const KEYFILEMOUNT = '/key'
    EQFILEMOUNTPT = '/eqconfig';
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
}catch{
    const CERTFILEMOUNT = path.resolve('../certs/exui.de/fullchain.pem')
    const KEYFILEMOUNT = path.resolve('../certs/exui.de/privkey.pem')
    EQFILEMOUNTPT = path.resolve('../Campaign_Configs/Testsite.json');
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
    console.log("cant open keyfile")
}




// The equipment configuration is mounted into the adapters'
// docker container by docker swarm using the "configs" property
// in docker-compose.yml
var EQCONFIG = {};

// Defaults
options.port = options.port || options.p || 8080;
options.host = options.host || '0.0.0.0'; //Listen to connections from all IPs by default ~Antonio
options.directory = options.directory || options.D || '.';

// Show command line options
if (options.help || options.h) {
    console.log("\nUsage: node app.js [options]\n");
    console.log("Options:");
    console.log("  --help, -h               Show this message.");
    console.log("  --port, -p <number>      Specify port.");
    console.log("  --directory, -D <bundle>   Serve files from specified directory.");
    console.log("  --eqpath, Specify path to equipment configuration (relative to app.js).")
    console.log("");
    process.exit(0);
}

app.disable('x-powered-by');

app.use('/proxyUrl', function proxyRequest(req, res, next) {
    console.log('Proxying request to: ', req.query.url);
    req.pipe(request({
        url: req.query.url,
        strictSSL: false
    }).on('error', next)).pipe(res);
});

class WatchRunPlugin {
    apply(compiler) {
        compiler.hooks.emit.tapAsync('WatchRunPlugin', (compilation, callback) => {
            console.log('Begin compile at ' + new Date());
            callback();
        });
    }
}

const webpack = require('webpack');
let webpackConfig;
if (__DEV__) {
    webpackConfig = require('./webpack.dev');
    webpackConfig.plugins.push(new webpack.HotModuleReplacementPlugin());
    webpackConfig.entry.openmct = [
        'webpack-hot-middleware/client?reload=true',
        webpackConfig.entry.openmct
    ];
    webpackConfig.plugins.push(new WatchRunPlugin());
} else {
    webpackConfig = require('./webpack.coverage');
}

const compiler = webpack(webpackConfig);

app.use(require('webpack-dev-middleware')(
    compiler,
    {
        publicPath: '/dist',
        stats: 'errors-warnings'
    }
));

if (__DEV__) {
    app.use(require('webpack-hot-middleware')(
        compiler,
        {}
    ));
}

// Expose index.html for development users.
app.get('/', function (req, res) {
    fs.createReadStream('index.html').pipe(res);
});

// Serve equipment configuration if user wants to view it
eqfile = fs.readFileSync(EQFILEMOUNTPT);
EQCONFIG = JSON.parse(eqfile);
// Make equipment configuration available on webserver ~Antonio
app.get("/eq.json", (req, res) => {
    res.json(EQCONFIG); //json response for proper formatting in browser ~Antonio
});

// Add logos to server ~Antonio
app.use(express.static('./dist/images'));

// Finally, open the HTTP server and log the instance to the console

if(EQCONFIG.DNS.useHTTPS == "True"){
    const server = https.createServer({key: key, cert: cert }, app);
    server.listen(options.port, options.host, function () {
        console.log('Open MCT application running at %s:%s', options.host, options.port);
    });
}else{
    app.listen(options.port, options.host, function () {
        console.log('Open MCT application running at %s:%s', options.host, options.port);
    });
}
    


