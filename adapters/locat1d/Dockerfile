FROM node:18-slim

# Create app directory
WORKDIR /usr/src/exui_locat1d

COPY . .

RUN npm install

CMD [ "node", "adapter.js" ]