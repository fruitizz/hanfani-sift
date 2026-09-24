# Sift — image de production : le serveur Hono sert /api et le SPA construit.
#
# Deux étages. Le premier construit dist/ (tsc + vite, donc toutes les
# dépendances). Le second ne garde que ce qui tourne — mais `npm start` lance
# `tsx server/index.ts`, alors tsx et les types restent nécessaires à
# l'exécution : on réinstalle tout plutôt que de pruner et de casser le
# démarrage.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY tsconfig.json tsconfig.node.json ./

# Le port réel vient de l'environnement (PORT) ; 8787 n'est que la valeur par
# défaut locale.
EXPOSE 8787
CMD ["npm", "start"]
