FROM node:18-slim

# Create app directory
WORKDIR /usr/src/exui_web

# add local verdacchio npm registry here?

COPY . .
RUN npm install

# If you are building your code for production
# RUN npm ci --only=production

CMD [ "node", "app.js" ]
# Do not use "start" script here to avoid docker using "prestart script" which
# copies plugins into webserver. Docker is not capable of doing that (plugins are outside
# working directory). "npm start" is reserved for isolated testing or dev. of webserver
