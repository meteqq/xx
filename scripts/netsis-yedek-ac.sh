#!/usr/bin/env bash
# Netsis .bak yedeğini Docker'da geçici bir SQL Server'a açar.
#
#   scripts/netsis-yedek-ac.sh /yol/NETSIS_2026.bak            # aç
#   scripts/netsis-yedek-ac.sh --kapat                          # işi bitince SQL Server'ı sil
#
# Ortam değişkenleri: NETSIS_SIFRE (sa şifresi, varsayılan rastgele), NETSIS_PORT (1433)
set -euo pipefail

AD=netsis-sql
PORT="${NETSIS_PORT:-1433}"
IMAJ=mcr.microsoft.com/mssql/server:2022-latest
SQLCMD=/opt/mssql-tools18/bin/sqlcmd

if [[ "${1:-}" == "--kapat" ]]; then
  docker rm -f "$AD" >/dev/null && echo "Geçici SQL Server silindi."
  exit 0
fi

BAK="${1:?Kullanım: $0 /yol/yedek.bak}"
[[ -f "$BAK" ]] || { echo "Dosya bulunamadı: $BAK"; exit 1; }
command -v docker >/dev/null || { echo "Docker kurulu değil. Kurulum: https://docs.docker.com/engine/install/"; exit 1; }

SIFRE="${NETSIS_SIFRE:-Nts_$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)1a}"
VT="$(basename "$BAK" | sed 's/\.[bB][aA][kK]$//' | tr -c 'A-Za-z0-9_\n' '_')"

if ! docker ps --format '{{.Names}}' | grep -qx "$AD"; then
  docker rm -f "$AD" >/dev/null 2>&1 || true
  echo "SQL Server başlatılıyor (ilk seferde imaj indirilir, birkaç dakika sürebilir)..."
  docker run -d --name "$AD" -e ACCEPT_EULA=Y -e "MSSQL_SA_PASSWORD=$SIFRE" -e MSSQL_COLLATION=Turkish_CI_AS \
    -p "127.0.0.1:$PORT:1433" "$IMAJ" >/dev/null
else
  SIFRE="$(docker exec "$AD" printenv MSSQL_SA_PASSWORD)"
fi

sql() { docker exec "$AD" "$SQLCMD" -C -S localhost -U sa -P "$SIFRE" -b "$@"; }

for i in $(seq 1 60); do
  sql -Q "SELECT 1" >/dev/null 2>&1 && break
  [[ $i == 60 ]] && { echo "SQL Server başlamadı: docker logs $AD"; exit 1; }
  sleep 2
done

echo "Yedek kopyalanıyor..."
docker exec -u 0 "$AD" mkdir -p /var/opt/mssql/yedek
docker cp "$BAK" "$AD:/var/opt/mssql/yedek/$VT.bak"
docker exec -u 0 "$AD" chown -R mssql /var/opt/mssql/yedek

# Yedekteki mantıksal dosya adlarını bul ve her birini yeni konuma taşı
MOVE=""
i=0
while IFS='|' read -r mantiksal tip; do
  mantiksal="$(echo "$mantiksal" | xargs)"; tip="$(echo "$tip" | xargs)"
  [[ -z "$mantiksal" ]] && continue
  uzanti=$([[ "$tip" == "L" ]] && echo ldf || echo mdf)
  MOVE+=", MOVE N'$mantiksal' TO N'/var/opt/mssql/data/${VT}_$i.$uzanti'"
  i=$((i + 1))
done < <(sql -h -1 -W -s '|' -Q "SET NOCOUNT ON; DECLARE @f TABLE (LogicalName nvarchar(128), PhysicalName nvarchar(260), Type char(1), FileGroupName nvarchar(128), Size numeric(20,0), MaxSize numeric(20,0), FileId bigint, CreateLSN numeric(25,0), DropLSN numeric(25,0), UniqueId uniqueidentifier, ReadOnlyLSN numeric(25,0), ReadWriteLSN numeric(25,0), BackupSizeInBytes bigint, SourceBlockSize int, FileGroupId int, LogGroupGUID uniqueidentifier, DifferentialBaseLSN numeric(25,0), DifferentialBaseGUID uniqueidentifier, IsReadOnly bit, IsPresent bit, TDEThumbprint varbinary(32), SnapshotUrl nvarchar(360)); INSERT INTO @f EXEC('RESTORE FILELISTONLY FROM DISK = N''/var/opt/mssql/yedek/$VT.bak'''); SELECT LogicalName, Type FROM @f")

[[ -z "$MOVE" ]] && { echo "Yedek dosyası okunamadı (geçerli bir SQL Server .bak dosyası mı?)"; exit 1; }

echo "Veritabanı açılıyor: $VT"
sql -Q "RESTORE DATABASE [$VT] FROM DISK = N'/var/opt/mssql/yedek/$VT.bak' WITH REPLACE, RECOVERY$MOVE" >/dev/null

cat <<EOF

Netsis yedeği açıldı.

  Sunucu     : localhost:$PORT
  Kullanıcı  : sa
  Şifre      : $SIFRE
  Veritabanı : $VT

Sonraki adımlar:
  NETSIS_SIFRE='$SIFRE' npm run netsis -- kesif --port $PORT --veritabani $VT
  NETSIS_SIFRE='$SIFRE' npm run netsis -- aktar --port $PORT --veritabani $VT --deneme
  NETSIS_SIFRE='$SIFRE' npm run netsis -- aktar --port $PORT --veritabani $VT

İş bitince: $0 --kapat
EOF
