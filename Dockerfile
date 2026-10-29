FROM node:22.23.4-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
 && update-ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN node --version

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# One shared Python environment for hosted Flask apps, including original Hub submodules.
COPY hosted-apps ./hosted-apps
RUN python3 -m venv /opt/pyenv \
 && cat hosted-apps/requirements.base.txt hosted-apps/*/requirements.txt 2>/dev/null | sort -u > /tmp/requirements.txt \
 && /opt/pyenv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

COPY . .

RUN npm ci --omit=dev --prefix src/legacy/dtech-hub

ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/pyenv/bin/python
EXPOSE 3000

CMD ["npm", "start"]
