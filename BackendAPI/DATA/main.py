import asyncio
import json
import redis.asyncio as redis
import time
import ssl
import websockets

EQFILEMOUNTPT = '/eqconfig'

datapoint_counter = 0
datapoint_timer = 0

datasources = []
redis_streams = {}

ws_connections = set()
ws_queues = []

async def parse_eq_config():
    global datasources

    nodes = []

    f = open(EQFILEMOUNTPT)
    data = json.load(f)

    datasources = data['datasources']

async def websocket_handler(ws):
    global ws_connections
    global ws_queues

    queue = asyncio.Queue(maxsize=128)
    last_keepalive = time.time()

    print(f"WS: connected")

    ws_connections.add(ws)
    ws_queues.append(queue)

    while True:
        msg = await queue.get()

        if queue.qsize() > 0.9 * queue.maxsize:
            print(f"WARN: ws queue almost full ({queue.qsize()/queue.maxsize})")

        #print(f"WS> {json.dumps(msg)}")

        try:
            await ws.send(json.dumps(msg))
        except Exception as e:
            print(f"WS: Handler exception {e}")
            break

    print(f"WS: disconnected")
    ws_connections.remove(ws)
    ws_queues.remove(queue)

async def websocket_task():
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_cert = "/cert"
    ssl_key = "/key"
    ssl_context.load_cert_chain(ssl_cert, keyfile=ssl_key)

    async with websockets.serve(websocket_handler, "0.0.0.0", 9100, ssl=ssl_context):
        while True:
            keepalive = {
                'type': 'Keepalive',
                'data': {
                    'utc': int(time.time_ns()/1000),
                    'value': 'keepAlive',
                    'key': 'keepAlive'
                }
            }

            asyncio.gather(*[queue.put(keepalive) for queue in ws_queues])
            await asyncio.sleep(0.5)

async def redis_task():
    global r
    global redis_queue
    global redis_streams
    global datasources

    r = redis.Redis(host='redis', port=6379, decode_responses=True)

    # Subscribe to all data sources
    for s in datasources:
        streamkey = s['key']+':DATA'
        print(f"SUBSCRIBE {streamkey}")
        redis_streams[streamkey] = '$'

    while True:
        l = await r.xread(streams=redis_streams, block=100)

        # Skip processing if no streams produced results
        if len(l) == 0:
            continue

        packet = {'type': 'RealtimeData', 'data': []}
        for stream in l:
            # Save last received IDs, to pick up where we left off next time
            # stream[0] is the stream key, stream[1] is a list of tuples with (id,data) pairs
            # See: https://redis-py.readthedocs.io/en/stable/examples/redis-stream-example.html
            redis_streams[stream[0]] = stream[1][-1][0]

            # Name of datasource (without :DATA suffix)
            basekey = stream[0].split(':')[0]

            for id, data in stream[1]:
                utc = int(id.split('-')[0])
                #print(f"data: {data}")

                for key, val in data.items():
                    packet['data'].append({
                        'utc': utc,
                        'key': f'{basekey}${key}',
                        'value': float(val)
                    })

        asyncio.gather(*[queue.put(packet) for queue in ws_queues])
        #print(f"packet: {packet}")

async def main():
    await parse_eq_config()

    async with asyncio.TaskGroup() as tg:
        tg.create_task(redis_task())
        tg.create_task(websocket_task())

if __name__ == "__main__":
    asyncio.run(main())
