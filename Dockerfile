FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# One shared Python environment for every hosted student app (Flask apps run behind /apps/<slug>).
COPY hosted-apps ./hosted-apps
RUN python3 -m venv /opt/pyenv \
 && cat hosted-apps/requirements.base.txt hosted-apps/*/requirements.txt 2>/dev/null | sort -u > /tmp/requirements.txt \
 && /opt/pyenv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

COPY . .

ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/pyenv/bin/python
EXPOSE 3000

CMD ["npm", "start"]
