FROM node:16

COPY . /app
WORKDIR /app

RUN curl https://getsubstrate.io -sSf | /bin/bash -s -- --fast
ENV PATH="/root/.cargo/bin:${PATH}"

RUN git config --global user.name "Acala Benchmarking Bot"
RUN git config --global user.email hello@acala.network
RUN git config --global submodule.recurse true

RUN yarn
CMD yarn start
