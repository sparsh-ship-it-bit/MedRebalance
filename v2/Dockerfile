FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY frontend/src ./src
COPY frontend/index.html frontend/style.css ./
RUN npm run build && cp index.html style.css dist/

FROM golang:1.23-alpine AS backend
WORKDIR /src
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/medrebalance ./

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=backend /out/medrebalance ./medrebalance
COPY --from=frontend /src/dist ./frontend/dist
ENV STATIC_DIR=/app/frontend/dist
ENV PORT=8080
EXPOSE 8080
CMD ["/app/medrebalance"]
