var argv = require('minimist')(process.argv.slice(2))
const Net = require('net');
const fs = require('fs');
const path = require('path');

var EQFILEMOUNTPT

try{
    EQFILEMOUNTPT = '/eqconfig';
    var h = fs.readFileSync(EQFILEMOUNTPT)
}catch(err){
    
    EQFILEMOUNTPT = path.resolve('../../privat_eqconfig/CRYOLaunchconf.json');
    console.log("cant open keyfile")
}

var EQCONFIG = {};
var SRC = {}

// GLOBAL VARS
var srcSocket = {};
var destSocket = {}
var timeoutstate = {};
var timeoutretrycount = 0;

var loc = {}


var AntennaIntervall = 100

function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    EQCONFIG = JSON.parse(eqfile);
    // console.log(eqconfig)

    let tcpcounter = 0
    /*EQCONFIG.datasources.forEach( (source, i) => {
        if(source.type == "TCP" || source.type == "tcp") {
            tcpcounter += 1;
            if(tcpcounter == TASKSLOT) { //i.e. Only handle first tcp source if TASKSLOT=1
                SRC = source;
            }
        }
    });*/
    SRC = EQCONFIG.TrackingAntenna;
}   

async function setupSockets()
{        

    //destSocket = new udp.createSocket('udp4')

    destSocket = new Net.Socket();
    destSocket.setEncoding("UTF-8")
    timeoutstate.dest = false;

    srcSocket = new Net.Socket();
    srcSocket.setEncoding("UTF-8");
    timeoutstate.src = false;  //xx
}

async function connectToSources()
{       
    console.log("Source connecting to:"+SRC.srcip +":"+SRC.sourceport)
    // Try to connect to source
    srcSocket.connect(SRC.sourceport, SRC.srcip)
}

async function connectToDest(){
    console.log("Destination connecting to:"+SRC.destip +":"+SRC.destport)
    destSocket.connect(SRC.destport, SRC.destip)
}

function defineEvents()
{   
    
    
    
    //If an error on connection to data source occurs, try to reconnect periodically
    srcSocket.on('error', async(error) => {
        console.log("[" + SRC.name + "]\t" + "Connection to " + SRC.name + 
            " failed. Reason: \"" + error + "\" Trying to reconnect in 1s")
        //Let ex-ui client know about error:
        srcSocket.destroy()
    });

    srcSocket.on('close', async(error) => {
        console.log("[" + SRC.name + "]\t" + "Connection to " + SRC.name + 
            " closed. Reason: \"" + error + "\" Trying to reconnect in 1s")
        //Let ex-ui client know about error:
        await sleep(1000)
        // Reconnection interval will not be 1s but conn. establishment time + 1s
        connectToSources();
    });
    
    srcSocket.on('ready', () => {
        console.log("[" + SRC.name + "]\t" + "Connected.");
        timeoutretrycount = 0
        if ("timeout" in SRC) {
            if(SRC.timeout > 1) {
                timeout = setTimeout(async() => {
                    console.log("[" + SRC.name + "]\t" + "Not responding!")
                    

                    //If we just transitioned into timeout state, put one poll in write buffer to
                    //trigger data event when device responds again

                    timeoutstate.src = true;

                    timeoutretrycount++;
                    if(timeoutretrycount >= SRC.maxretries){
                        console.log("[" + SRC.name + "]\t" + "Maxretry. Try reconnecting");
                        clearTimeout(timeout)
                        srcSocket.destroy()
                    }else{
                        timeout.refresh();
                    }
                }, SRC.timeout);
            }
        }
    })

    // Handler for incoming TCP data from source
    var line = "";
    srcSocket.on('data', data => {
        //console.log(data);
        //console.log("[" + SRC.name + "]\t" + "Received Data.");
        
        // If data arrives after a timeout event, log successful reconnection
        if(timeoutstate.src == true) {
            timeoutstate.src = false;
            console.log("[" + SRC.name + "]\t" + "Reconnected.")
        }
        // Data arrived, so everything is ok -> Reset timeout
        //timeout.refresh();
        // Data arrived, so it is allowed to schedule next poll
    
        //Parse incoming Data
      
        var str_data = data.toString();
        line += str_data;
        if(line.includes("\n")){
            let str_int = line.split("\n");
            var str_over = ""
            if(str_int.length  >=2 && line.slice(-1)!=("\n")){
                str_over = str_int.pop()
            }
            line = str_over
            str_int.forEach(line =>{
            
                console.log("Recived data. Data is:"+ line);
                split_line = line.split(SRC.delimiter)
                console.log("Data to parse is type:"+split_line[0]+" Value is:"+split_line[1] + "Format to use is:" );
                    if(split_line[1] != undefined && split_line[0] == SRC.datapoints[0].label) {
                        var data_string = [];
                        data_string.push(split_line[1]);
                        for (i in SRC.datapoints[0].GPS.delimiter){
                            //console.log(data_string);
                            for (k in data_string){
                                data_string_buff = [];
                                data_string_split = data_string[k].split(SRC.datapoints[0].GPS.delimiter[i]);
                                //console.log("String split "+ k +' ' +data_string_split);
                                for (t in data_string){
                                    if (t != k)
                                        data_string_buff.push(data_string[t]);
                                    else{
                                        for (s in data_string_split){
                                            if(data_string_split[s]!= '')
                                                data_string_buff.push(data_string_split[s]);
                                        }
                                    }
                                }
                                data_string = data_string_buff;
                            }
                        }
                        console.log(data_string);
                        for (i in SRC.datapoints[0].GPS.dataorder){
                            loc[SRC.datapoints[0].GPS.dataorder[i]] = data_string[i] 
                        }
                        if (split_line[1].includes('S'))
                            loc.latDir = 'S'
                        else
                            loc.latDir = 'N'
                        if (split_line.includes('W'))
                            loc.longDir = 'W'
                        else
                            loc.longDir = 'W'
                        
                    }else if(split_line[1] != undefined && split_line[0] == SRC.datapoints[1].label){
                            loc["ALT"]=split_line[1]   
                    }
            });
            // Clear line buffer for next TCP data
        }
        
        
    })

    //If an error on connection to data source occurs, try to reconnect periodically
    destSocket.on('error', async(error) => {
        console.log("[" + SRC.name + "]\t" + "Connection to " + SRC.name + 
            " failed. Reason: \"" + error + "\" Trying to reconnect in 1s")
        //Let ex-ui client know about error:
        // Reconnection interval will not be 1s but conn. establishment time + 1s
        connectToDest();
    });
    
}

function calc_Checksumm_NEMA(SendString){
    /*var checksum = 0;
    for(var i = 0; i < SendString.length; i++) {
    checksum = checksum ^ SendString.charCodeAt(i);
    }*/

    var checksum = 0;
    for(var i = 0; i < SendString.length; i++) {
        checksum = checksum ^ SendString.charCodeAt(i);
    }

    // Convert it to hexadecimal (base-16, upper case, most significant nybble first).
    var hexsum = Number(checksum).toString(16).toUpperCase();
    if (hexsum.length < 2) {
        hexsum = ("00" + hexsum).slice(-2);
    }
    return hexsum
}

function send_NEMA(){
    //console.log("Try to send nema  "+loc.lat+" "+ loc.long+" "+loc["ALT"]);
    console.log(loc);
    //console.log(convert_UBX_to_NEMA("48.16315"));
    if (loc.lat && loc.long && loc.ALT){
        //counter++;
        //loc["ALT"] = ""+(0.5*Math.pow((counter*AntennaIntervall)/1000,2)*50)
        var send = create_Nema_0183_GGA_string(convert_UBX_to_NEMA(loc.lat).slice(0,7),loc.latDir,convert_UBX_to_NEMA(loc.long),loc.longDir,loc.ALT)
        //var send = create_Nema_0183_GGA_string("4816.315",'N',"01140.182",'E',loc["ALT"])
        console.log(send);
        try {
            destSocket.write(send)
        } catch (error) {
            console.log(error); 
        }
    }
}

//coord in form DD.dddddd!
function convert_UBX_to_NEMA(coord){
    coord = Math.abs(parseFloat(coord))
    var decdeg = coord % 1
    var deg = coord - decdeg
    
    console.log("deg:" + deg +" decdeg:"+decdeg);

    return (""+deg+decdeg*60).slice(0,8)

}
function create_Nema_0183_GGA_string(lat, lat_dir ,long, long_dir, height){
    if (parseInt(long)<10000){
        long = "0"+long
    }
    var string = 'GPGGA,'+get_HHMMSSss_string()+","+lat+","+lat_dir+","+long+","+long_dir+","+"1,09,0.0,"+height+",m,0.0,m,0.0,0001"
    string = "$"+string+"*"+calc_Checksumm_NEMA(string)
    return string
}
function get_HHMMSSss_string(){
    let date = new Date()
    date_string =  ""+date.getHours()+date.getMinutes()+date.getSeconds()+"."+date.getMilliseconds()
    //console.log("data strig " + date_string);
    return date_string
}

async function main()
{
    await parseEqConfig();
    await setupSockets();
    // src = {} means connect to all sources
    await defineEvents();
    await connectToSources();
    await connectToDest()
    setInterval(send_NEMA, AntennaIntervall);
    //await connectToDest();
}

// ### SOFT SHUTDOWN ### //
process.on('SIGTERM', () => {
    console.log("Soft shutdown requested, bye...")
    // Soft close
    destSocket.clients.forEach((socket) => {
        socket.close();
    })
    // If a socket somehow stayed open after 5s, close it
    setTimeout(() => {
        destSocket.clients.forEach((socket) => {
          if ([socket.OPEN, socket.CLOSING].includes(socket.readyState)) {
            socket.terminate();
          }
        });
        process.exit(0)
      }, 5000);

    // TODO: handle srcSocket closing
})

main()