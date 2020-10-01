FROM node:14

COPY . /app
WORKDIR /app


RUN curl https://getsubstrate.io -sSf | /bin/bash -s -- --fast
ENV PATH="/root/.cargo/bin:${PATH}"

RUN yarn
CMD yarn start
