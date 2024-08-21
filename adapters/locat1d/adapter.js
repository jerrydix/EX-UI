const fs = require('fs');
const express = require('express');
const app = express()
const https = require('https');
const path = require('path');
var argv = require('minimist')(process.argv.slice(2))


const TASKSLOT = argv._[0]; 

var key;
var cert;
const CERTFILEMOUNT = '/cert'
const KEYFILEMOUNT = '/key'
try{
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
}catch{
    console.log("cant open keyfile")
}



const EQFILEMOUNTPT = '/eqconfig';
//const EQFILEMOUNTPT = path.resolve('../../privat_eqconfig/eqconfig.json');

const SERVINGPORT = 9000; //MAped in Docker to an free port 
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
            if(datapoint.name == "wasserfall_map" || datapoint.name == "Wasserfall_Map" ) {
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
    const server = https.createServer({key: key, cert: cert }, app);
    server.listen(SERVINGPORT, () => { console.log('listening on '+SERVINGPORT) });
}else{
    app.listen(SERVINGPORT, () => { console.log('listening on '+SERVINGPORT) });
}