FROM node:18

RUN apt-get update && apt-get install -y openssl

WORKDIR /usr/src/exui_opcua

COPY . .

RUN npm install

CMD [ "node", "adapter.js" ]