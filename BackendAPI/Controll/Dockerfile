FROM node:18-slim

# Create app directory
WORKDIR /usr/src/exui_aprs

COPY . .

RUN npm install

CMD [ "node", "API.js" ]