#!/bin/bash

container_id=$(docker ps | grep mcs | sed -E 's/.*(exui_mcs[\.\w]+)/\1/')
docker logs --follow $container_id
