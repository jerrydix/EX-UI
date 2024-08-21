#!/bin/bash
docker swarm leave --force
python3 install.py
python3 start.py
