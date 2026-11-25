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
RUN npm ci --omit=dev --prefix src/legacy/teacher-planner
RUN npm ci --omit=dev --prefix src/legacy/assessment-manager

# Patch any Debian Ghostscript packages present in the image and reject an
# unverified Ghostscript executable. Debian bookworm backported this CVE fix.
RUN apt-get update \
 && for package in ghostscript libgs10 libgs10-common; do \
      if [ "$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null)" = installed ]; then \
        apt-get install -y --only-upgrade "$package" || exit 1; \
        version="$(dpkg-query -W -f='${Version}' "$package")"; \
        dpkg --compare-versions "$version" ge '10.0.0~dfsg-11+deb12u9' || exit 1; \
        echo "$package $version: CVE-2026-125396 Debian fix verified"; \
      fi; \
    done \
 && if command -v gs >/dev/null 2>&1; then \
      [ "$(dpkg-query -W -f='${db:Status-Status}' ghostscript 2>/dev/null)" = installed ] \
        && [ "$(readlink -f "$(command -v gs)")" = /usr/bin/gs ] \
        && [ -z "$(dpkg --verify ghostscript)" ] \
        || { echo 'Unverified Ghostscript executable in image' >&2; exit 1; }; \
    fi \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/pyenv/bin/python
EXPOSE 3000

CMD ["npm", "start"]
