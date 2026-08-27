FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
