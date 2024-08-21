<template>
    <div style="width: 25%; margin: auto">
        <h1>{{ SRC.name }}/{{ DP.name }}</h1>
        <!--<div class="Paswd_wrap">
                <h1>Password:</h1>
                <input type="Password" @change="openmct.objects.mutate(currentDomainObject,'paswd',this.pswd)" v-model="pswd">
        </div>-->

        <div style="display: flex; align-items: center; flex-direction: column;">
            <table style="table-layout: fixed;">
                <colgroup>
                    <col style="width: 5em">
                    <col style="width: 5em">
                    <col style="width: 5em">
                </colgroup>
                <thead>
                    <tr>
                        <td>
                            <h4 v-bind:class="{ 'rotating': rotating, 'not-rotating': !rotating }">
                                {{ rotating ? "ROTATING" : "STABLE" }}</h4>
                        </td>
                        <th>Real</th>
                        <th>Input</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th style="background: #575757;">
                            Status
                        </th>
                        <td>
                            <!--<div v-if='currentEnabled == 1' class="icon-checked"></div>
                            <div v-if='currentEnabled == 0' class="icon-x"></div>-->
                            {{ currentEnabled == 1 ? "Enabled" : "Disabled" }}
                        </td>
                        <td>
                            <input type="checkbox" v-model="currentInputEnabled" style="width: 5em;">
                        </td>
                    </tr>
                    <tr>
                        <th style="background: #575757;">
                            Angle
                        </th>
                        <td>
                            {{ currentAngle }}
                        </td>
                        <td>
                            <input type="text" v-model.number="currentInputAngle" style="width: 5em;">
                        </td>
                    </tr>
                </tbody>
            </table>
            <div style="display: flex; align-items: center; flex-direction: row;">
                <button class="ControllButton" id="SendButton" @click="sendEnable()" type="button"
                    :disabled="currentEnabled == currentInputEnabled || rotating">
                    Submit Enable
                </button>
                <button class="ControllButton" id="SendButton" @click="sendAngle()" type="button"
                    :disabled="currentInputAngle == 0 || rotating || currentEnabled == 0">
                    Submit Angle
                </button>
            </div>
        </div>

    </div>
</template>
<script>
var Socket = null;
var socketInterval = null;
var reconnectInterval = null;
var socketTimeout = null;
const timeout = 30000;


export default {
    inject: ['openmct', 'domainObject'],
    data: function () {
        let source, datapoint, control;
        [source, datapoint, control] = this.domainObject.adapter;
        return {
            currentDomainObject: this.domainObject,
            SRC: source,
            DP: datapoint,
            CTRL: control,
            currentAngle: 0,
            currentInputAngle: 0,
            currentEnabled: 0,
            currentInputEnabled: 0,
            SRCKEY: this.domainObject.adapter.key,
            pswd: this.domainObject.paswd,
            SocketPort: source.openport,
            showDialog: false,
            rotating: false,
            timer: null
        };
    },
    // computed: {
    //     calibsJsonUri() {
    //         let calibsJson = JSON.stringify(this.Calibs);
    //         let blob = new Blob([calibsJson], { type: 'application/json' });
    //         let blobUrl = URL.createObjectURL(blob);
    //         return blobUrl;
    //     }
    // },
    methods: {
        sendEnable() {
            let cmd = {
                cmd: 'set',
                input: {
                    key: this.CTRL[0].key,
                    tcp: {
                        values: {
                            enabled: this.currentInputEnabled ? 1 : 0
                        }
                    },
                    parsestring: this.CTRL[0].parsestring
                }
            }
            this.handleSend(cmd)
        },
        sendAngle() {
            this.rotating = true;
            let sign;
            if (this.currentInputAngle < 0) {
                sign = "-"
            } else {
                sign = "+"
            }

            let cmd = {
                cmd: 'set',
                input:
                {
                    key: this.CTRL[1].key,
                    tcp: {
                        values: {
                            sign: sign,
                            deg: Math.abs(this.currentInputAngle)
                        }
                    },
                    parsestring: this.CTRL[1].parsestring
                }

            }
            this.handleSend(cmd)
        },
        handleSend(cmd) {
            let Data = {
                commands: [cmd]
            }

            console.log(JSON.stringify(Data))
            Socket.send(JSON.stringify(Data))
        },
        handleLoad() {
            let Data = {
                commands: [
                    {
                        cmd: 'get',
                        data: {
                            key: this.CTRL[0].key,
                        }
                    },
                    {
                        cmd: 'get',
                        data: {
                            key: this.CTRL[1].key,
                        }
                    }
                ]
            }
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

                let resp = JSON.parse(msg.data)

                for (let i = 0; i < resp.length; i++) {
                    if (resp[i]['type'] !== 'get_response') {
                        continue;
                    }
                    let datapoint = resp[i]['data'];

                    if (datapoint.key === here.CTRL[0].key) {
                        //enabled data
                        here.currentEnabled = datapoint.value;
                    } else if (datapoint.key === here.CTRL[1].key) {
                        //angle data
                        if (here.currentAngle != datapoint.value) {
                            here.rotating = false;
                        }
                        here.currentAngle = datapoint.value;
                    }              
                }

            };
        },
    },
    mounted: function () {
        this.createSocket()
        this.timer = setInterval(() => {
            this.handleLoad()
        }, 200)
    },
    beforeDestroy: function () {
        clearInterval(this.timer);

        clearTimeout(socketTimeout);
        clearInterval(socketInterval);
        clearInterval(reconnectInterval);
        if (Socket != null) {
            Socket.close();
        }
    },
    destroyed: function () {

    }

};
</script>
