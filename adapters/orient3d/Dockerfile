FROM node:18-slim

# Create app directory
WORKDIR /usr/src/exui_orien3d

COPY . .

RUN apt update && apt install -y python3 make build-essential
RUN npm install

CMD [ "node", "adapter.js" ]
