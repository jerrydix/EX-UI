FROM python:3-alpine

WORKDIR /usr/src/exui_DataAPI

COPY ./requirements.txt .

RUN pip install -r requirements.txt

COPY . .

CMD [ "python3", "main.py" ]
