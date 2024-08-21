<template>
    <div>
        <div class="overlay-background" :style="{ display: showDialog ? 'flex' : 'none' }">
            <div class="overlay-edit-dialog" :style="{ display: showDialog ? 'block' : 'none' }">
            </div>
        </div>

        <h1>{{ SRC.name }} Calibrations</h1>
        <!--<div class="Paswd_wrap">
                <h1>Password:</h1>
                <input type="Password" @change="openmct.objects.mutate(currentDomainObject,'paswd',this.pswd)" v-model="pswd">
        </div>-->
        <table style="table-layout: fixed">
            <colgroup>
                <col style="width: 2em">
                <col style="width: 15em">
                <col style="width: 15em">
                <col style="width: 15em">
            </colgroup>
            <thead>
                <tr>
                    <th></th>
                    <th>Sensor</th>
                    <th>Offset</th>
                    <th>Slope</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(calib, calibIdx) in Calibs">
                    <td>
                        <a class="icon-trash" @click="deleteCalib(calibIdx)"></a>
                    </td>
                    <td>
                        <select :value="calib.key" @change="selectSensor(calib, $event)">
                            <option v-for="sensor in SENS" :value="sensor.key"
                                :disabled="selectedSENS.indexOf(sensor.key) >= 0">
                                {{ sensor.name }}
                            </option>
                        </select>
                    </td>
                    <td>
                        <input type="text" v-model="calib.offset">
                    </td>
                    <td>
                        <input type="text" v-model="calib.slope">
                    </td>
                </tr>
            </tbody>
            <tfoot>
                <tr>
                    <th :colspan="4" style="text-align: center" @click="addCalib()">
                        <a class="icon-plus"></a>
                    </th>
                </tr>
            </tfoot>
        </table>
        <div class="Button-wrap">
            <button class="ControllButton" id="SendButton" @click="handleSend()" type="button">Send to Target</button>
            <button class="ControllButton" id="LoadButton" @click="handleLoad()" type="button">Load from Target</button>
        </div>
        <a :href="calibsJsonUri" download="calibs.json">
            <span class="icon-export"></span>Export Calibs
        </a><br>
        <label for="importFile">
            <span class="icon-import"></span>Import Calibs:
        </label><br>
        <input type="file" id="importFile" name="importFile" @change="importCalibs($event)">
    </div>

</template>
<script>
var Socket = null;
var socketInterval = null;
var reconnectInterval = null;
var socketTimeout = null;
var preloadInterval = null;
const timeout = 30000;


export default {
    inject: ['openmct', 'domainObject'],
    data: function () {
        let source, allSensors;
        [source, allSensors] = this.domainObject.adapter;
        return {
            currentDomainObject: this.domainObject,
            SRC: source,
            SENS: allSensors,
            selectedSENS: [],
            SRCKEY: this.domainObject.adapter.key,
            pswd: this.domainObject.paswd,
            SocketPort: source.openport, 
            Calibs: this.domainObject.Calibs,
            showDialog: false,
        };
    },
    computed: {
        calibsJsonUri() {
            let calibsJson = JSON.stringify(this.Calibs);
            let blob = new Blob([calibsJson], { type: 'application/json' });
            let blobUrl = URL.createObjectURL(blob);
            return blobUrl;
        }
    },
    methods: {
        overwriteCalibs(newCalibs) {
            this.Calibs = newCalibs;
            this.selectedSENS = this.Calibs.map(calib => calib.key)
        },
        importCalibs(e) {
            console.log("Loading " + e.target.files[0].name);
            e.target.files[0].text().then((str) => {
                let newCalibs = JSON.parse(str);
                this.overwriteCalibs(newCalibs);
            });
        },
        addCalib() {
            this.Calibs.push({ key: '', offset: 0, slope: 1 })
        },
        selectSensor(calib, e) {
            let newKey = e.target.value
            let oldKey = calib.key
            //if value same as old, skip
            if (calib.key === newKey) {
                return;
            }

            //if old value was some key, remove it from selected
            if (oldKey !== '') {
                let index = this.selectedSENS.indexOf(oldKey)
                if (index >= 0) { this.selectedSENS.splice(index, 1); }
            }

            //add new key to selected if exists
            let sensor = this.SENS.find(sensor => sensor.key === newKey)
            if (sensor) {
                this.selectedSENS.push(newKey)
            }

            //update key of calib
            calib.key = newKey
        },
        deleteCalib(calibIdx) {
            //removed sensor from list of selected sensors
            let sensor = this.Calibs[calibIdx].key
            let index = this.selectedSENS.indexOf(sensor)
            if (index >= 0) {
                this.selectedSENS.splice(index, 1)
            }

            //remove calib
            this.Calibs.splice(calibIdx, 1);
        },
        handleSend() {
            let Data = {
                commands: [
                    {
                        cmd: 'load_calibs',
                        calibs: this.Calibs
                    }
                ]
            }
            console.log(JSON.stringify(Data))
            Socket.send(JSON.stringify(Data))
        },
        handleLoad() {
            let Data = {
                commands: [
                    {
                        cmd: 'download_calibs',
                    }
                ]
            }
            console.log(JSON.stringify(Data))
            Socket.send(JSON.stringify(Data))
        },
        createSocket() {
            var here = this
            var protocoll = "ws://"
            if (window.location.protocol == "https:") {
                protocoll = "wss://"
            }

            if (Socket != null) {
                Socket.close();
            }

            var domain = window.location.hostname
            //var socket = ReconnectingWebsocket(protocoll + domain + ':' + here.SocketPort);
            //Socket = socket;
            //this.addEvent_message();
            var SocketPromis = new Promise((resolve, reject) => {
                var socket = new WebSocket(protocoll + domain + ':' + here.SocketPort);
                console.log(socket);
                resolve(socket)
            });
            SocketPromis.then((socket) => {
                console.log(" --- try creating socket to ip: " + domain)
                Socket = socket
                reconnectInterval = setInterval(() => {
                    here.recreateSockets()
                }, 3000);
                Socket.onopen = function (e) {
                    clearInterval(reconnectInterval);
                    here.Eventopen()
                    here.sendKeepalive();
                    clearInterval(socketInterval);
                    socketInterval = setInterval(() => {
                        here.sendKeepalive();
                    }, 500);
                }
                console.log(Socket);
            }).catch((error) => {
                console.log(" error creating socket" + error);
            })
        },
        sendKeepalive() {
            Socket.send(JSON.stringify({
                msg_type: 'keepalive',
            }));
        },
        recreateSockets() {
            var here = this
            clearInterval(socketInterval);

            if (Socket != null) {
                Socket.close();
            }

            var socket = new WebSocket(Socket.url);
            console.log(socket.url + "- reconnecting");
            socket.onopen = function (e) {
                Socket = socket;
                clearInterval(reconnectInterval);
                here.Eventopen()
                clearInterval(socketInterval);
                socketInterval = setInterval(() => {
                    here.sendKeepalive();
                }, 500);
            }
        },
        EventError() {
            var here = this
            Socket.onerror = function (msg) {
                console.log(Socket.url + " ---socket error:" + msg + " , closing socket and try reconnecting")
            }

            Socket.onclose = function (msg) {
                console.log(Socket.url + " ---Websocket closed" + msg + " try reconnecting")
                //var Interval = setInterval (recreateSockets(),1000);
            }
        },
        Eventopen() {
            console.log(Socket.url + " connection open");
            this.EventError()
            this.addEvent_message()
        },
        addEvent_message() {
            var here = this
            clearTimeout(socketTimeout);
            socketTimeout = window.setTimeout(function () {
                console.log(Socket.url + " timeout exceeded")
                reconnectInterval = setInterval(() => {
                    here.recreateSockets()
                }, 3000);
            }, timeout)
            Socket.onmessage = function (msg) {
                clearTimeout(socketTimeout)
                socketTimeout = window.setTimeout(function () {
                    console.log(Socket.url + " timeout exceeded")
                    reconnectInterval = setInterval(() => {
                        here.recreateSockets()
                    }, 3000);
                }, timeout)

                let datapoint = JSON.parse(msg.data);

                if (datapoint.length === 1) {
                    if (datapoint[0].type == "download_calibs_response") {
                        here.overwriteCalibs(datapoint[0].calibs)
                    }
                }

            };
        },
        preload() {
            var here = this;
            var preloaded = false;
            preloadInterval = setInterval(() => {
                if (preloaded) {
                    clearInterval(preloadInterval);
                }

                if (Socket.readyState === WebSocket.OPEN) {
                    here.handleLoad();
                    preloaded = true;
                }
            }, 50)
        }
    },
    mounted: function () {
        this.createSocket();
        this.Calibs = [];

        this.preload();
    },
    beforeDestroy: function () {
        clearTimeout(socketTimeout);
        clearInterval(socketInterval);
        clearInterval(reconnectInterval);
        clearInterval(preloadInterval);
        if (Socket != null) {
            Socket.close();
        }
    },
    destroyed: function () {
        openmct.objects.mutate(this.domainObject, "Calibs", this.Calibs)
    }

};
</script>
