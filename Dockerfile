FROM python:3.12-slim

WORKDIR /app

COPY . .

EXPOSE 5500

ENV GEOSERVER_BASE=http://host.docker.internal:8080

CMD ["python", "serve_proxy.py"]
