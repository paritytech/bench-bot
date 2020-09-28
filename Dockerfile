FROM node:14
COPY . /app
WORKDIR /app
EXPOSE 3000
RUN yarn
CMD yarn start
