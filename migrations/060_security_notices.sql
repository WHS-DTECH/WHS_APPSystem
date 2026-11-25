CREATE TABLE security_vulnerability_notices (
  id BIGSERIAL PRIMARY KEY,
  details JSONB NOT NULL,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO security_vulnerability_notices (details, created_by, updated_by)
VALUES (
  '{"title":"Render: Ghostscript / ImageMagick - Upload2Shell","reference":"CVE-2026-125396","severity":"high","status":"verification-required","receivedOn":"2026-11-26","notice":"Render reports that Ghostscript processing a maliciously crafted file can allow remote code execution, including indirect use through ImageMagick or Pillow. Docker services or services bundling Ghostscript must update that copy before redeploying.","remediation":"Check the Global Control Docker image and all bundled copies independently of the DTECH-HUB native runtime. Update any affected packages and redeploy.","verification":"The DTECH-HUB native runtime was separately verified with a Debian security backport. That evidence does not establish the status of Global Control or its Docker image.","sourceUrl":"https://nvd.nist.gov/vuln/detail/CVE-2026-125396"}'::jsonb,
  'system', 'system'
);
