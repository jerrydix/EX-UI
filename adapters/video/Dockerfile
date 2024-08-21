FROM node:18

ARG TASKID

RUN apt-get update && apt-get install -y golang
WORKDIR /usr/src/exui_video
COPY . . 
COPY go.mod .
COPY go.sum .
RUN go mod download
RUN npm install
RUN go build -i -o ./build/exui_video
ENV GO111MODULE=on
ENV GIN_MODE=release

ENTRYPOINT [ "node adapter.js ${TASKID}", "go run *.go" ]