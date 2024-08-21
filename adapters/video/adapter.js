const fs = require('fs');
const path = require('path');
var argv = require('minimist')(process.argv.slice(2))

//ENVIRONMENT
const EQFILEMOUNTPT = '/eqconfig';
const CONFILEMOUNT = './config.json'
//const EQFILEMOUNTPT = path.resolve(argv._[0]);
//const CONFILEMOUNT = path.resolve(argv._[1]+ '/config.json')
const TASKSLOT = argv._[0]
// The equipment configuration is mounted into the adapters'
// docker container by docker swarm using the "configs" property
// in docker-compose.yml

// The destination port is identical for every adapter, because it
// is automatically mapped to an unused port in range specified in
// docker-compose.yml

var EQCONFIG = {};
var SRC = [];
var http_streamport = 9000;

function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    console.log(TASKSLOT);
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    EQCONFIG = JSON.parse(eqfile);
    
    // console.log(eqconfig)

    EQCONFIG.Video[TASKSLOT].streams.forEach((cam,j)=>{
            SRC.push(cam);                       //taking the data from `eq_example.json` and creating the config.json
        });
     
    httpport = EQCONFIG.Video[TASKSLOT].http_port
    console.log(SRC);
    
}  

function warmup(){

    let abc = "{\"server\":{\"http_port\":\":"+httpport+"\",\"ice_servers\":[\"stun:stun.l.google.com:19302\"]},\"defaults\":{\"audio\":true},\"streams\":{";
    SRC.forEach( (kam,k) =>{
        var jsonContent = JSON.stringify(kam);
        let js2 = jsonContent;
        let l2= js2.length;
        let js3 = js2.substring(1,l2-1);//eliminatin {}
        abc += js3;
        abc += ",";
    });
    
    let s = abc.substring(0, abc.length - 1)

    s+="}}";


fs.writeFile(CONFILEMOUNT, s, function (err) {
    if (err) throw err;
    console.log('Saved!');
  });
}

    parseEqConfig();
    warmup();
