const fs = require('fs');
const express = require('express');
const app = express()
const https = require('https');
const path = require('path');
var argv = require('minimist')(process.argv.slice(2))


const TASKSLOT = argv._[0]; 


var EQFILEMOUNTPT
var key;
var cert;
try{
    const CERTFILEMOUNT = '/cert'
    const KEYFILEMOUNT = '/key'
    EQFILEMOUNTPT = '/eqconfig';
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
}catch(err){
    const CERTFILEMOUNT = path.resolve('../../certs/exui.de/fullchain.pem')
    const KEYFILEMOUNT = path.resolve('../../certs/exui.de/privkey.pem')
    EQFILEMOUNTPT = path.resolve('../../privat_eqconfig/eqconfig.json');
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
    console.log("cant open keyfile")
}

const SERVINGPORT = 9100; //MAped in Docker to an free port 
var eqconfig;   

SRC = {}

function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    eqconfig = JSON.parse(eqfile);
    // console.log(eqconfig)

    let WScount = 0
    eqconfig.datasources.forEach( (source, i) => {
        var sourceWS = 0
        source.datapoints.forEach( (datapoint, i) =>{
            if(datapoint.adapter == "orient3d" || datapoint.adapter == "Orient3d" ) {
                sourceWS +=1;
                WScount += 1;
                if(WScount == TASKSLOT) { //i.e. Only handle first tcp source if TASKSLOT=1
                    SRC = source;
                    SRC.WStoServe = sourceWS;
                    var ips = []
                    eqconfig.computers.forEach(comp => {
                        ips.push(comp.ip)
                    })
                    SRC.IPtoconnect = ips;
                    SRC.useHTTPS = eqconfig.DNS.useHTTPS
                    console.log(SRC);
                    
                }
            }
        });
    });
} 



function serveSRC(){
    // Make equipment configuration available on webserver ~Antonio
    app.get("/eq.json", (req, res) => {
        res.json(SRC); //json response for proper formatting in browser ~Antonio
    });
}

function serveWebseite(){
    app.use( express.static( 'frontend' ));
}

parseEqConfig();
serveSRC();
serveWebseite();
if(eqconfig.DNS.useHTTPS == "True"){
    console.log("creating httpsserver");
    const server = https.createServer({key: key, cert: cert }, app);
    server.listen(SERVINGPORT, () => { console.log('listening on '+SERVINGPORT) });
}else{
    console.log("creating http server");
    app.listen(SERVINGPORT, () => { console.log('listening on '+SERVINGPORT) });
}