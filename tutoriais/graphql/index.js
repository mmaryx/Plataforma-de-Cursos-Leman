import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { criarLoaders } from './loaders.js';

dotenv.config();

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4000);

const server = new ApolloServer({
    typeDefs,
    resolvers
});

const { url } = await startStandaloneServer(server, {
    listen: { host: HOST, port: PORT },
    context: async ({ req }) => {
        const requestId = req.headers['x-request-id'] || randomUUID();
        const opName = req.body?.operationName || 'anonima';

        console.log(
            `[GRAPHQL] POST ${req.url || '/'} (op=${opName}) | X-Request-Id=${requestId}`
        );

        return {
            requestId,
            loaders: criarLoaders(requestId)
        };
    }
});

console.log(`Servidor GraphQL Leman pronto em ${url} (bind: ${HOST}:${PORT})`);