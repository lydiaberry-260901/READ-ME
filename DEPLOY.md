# Putting the CRM online on a Hostinger VPS

This guide takes the CRM from GitHub to a live, secure site on a Hostinger VPS (a virtual private server: a rented server of Moca's own). It is written to be followed in order, by someone comfortable copying commands into a terminal.

**Costs.** Nothing in this project buys anything. The VPS itself is the only paid item, and choosing and buying a plan is Moca's decision. Everything else used here is free: the HTTPS certificate (Let's Encrypt), the software on the server, and GitHub's free allowance for the automatic tests.

**What was checked.** The app, the tests and the production build were checked on a development computer. The server steps below use standard Ubuntu commands but have not yet been run on Moca's actual VPS, so go carefully the first time and stop if anything looks different.

## 1. What you need before starting

* A Hostinger VPS running **Ubuntu 24.04**, with at least 2 GB of memory (4 GB is more comfortable). When choosing the data centre, pick the **UK or EU**.
* The VPS's IP address and root password (or SSH key), from the Hostinger panel.
* A web address for the CRM, for example `crm.moca.energy`. In the DNS settings for moca.energy, add an **A record** for `crm` pointing to the VPS's IP address. It can take up to an hour to work.
* Google and Microsoft sign in settings (README, "Setting up Google sign in" and "Setting up Microsoft sign in"), with the live address added.
* The email account that sends alert emails (SMTP host, user and password).
* Optional: the Claude API key, Companies House key and news service key.

## 2. First sign in to the server and basic security

From your own computer (replace the IP address):

```
ssh root@203.0.113.10
```

Update everything, set the time zone, and turn on automatic security updates:

```
apt update && apt upgrade -y
timedatectl set-timezone Europe/London
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

Create a user for the app, so it never runs as root:

```
adduser moca
usermod -aG sudo moca
```

Copy your SSH key to the new user (run this on **your own computer**), then check you can sign in as `moca` before going on:

```
ssh-copy-id moca@203.0.113.10
ssh moca@203.0.113.10
```

Now turn off password and root sign in over SSH. Edit `/etc/ssh/sshd_config` (for example `sudo nano /etc/ssh/sshd_config`) and set:

```
PermitRootLogin no
PasswordAuthentication no
```

Then `sudo systemctl restart ssh`. Keep your current window open and check you can still sign in from a new one.

Allow only SSH and the website through the firewall:

```
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw enable
```

(Run the Nginx line after installing Nginx in the next step if ufw does not recognise it yet.)

## 3. Install the software

```
sudo apt install -y git gnupg curl nginx postgresql postgresql-contrib certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node --version   # should say v24
psql --version   # should say 16
```

## 4. The database

Create a database user with a long random password, and the database. Postgres only listens on the server itself by default, which is what we want.

```
DB_PASSWORD="$(openssl rand -hex 24)"
echo "Database password: $DB_PASSWORD"   # copy it now, you need it for .env
sudo -u postgres psql -c "CREATE ROLE moca LOGIN PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE moca_crm OWNER moca;"
sudo -u postgres psql -c "ALTER DATABASE moca_crm SET timezone TO 'Europe/London';"
```

## 5. Get the code from GitHub

The repository is read with a **deploy key**: a key that can only read this one repository.

```
ssh-keygen -t ed25519 -C "moca-crm server" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

In GitHub, open the repository, then Settings, Deploy keys, Add deploy key. Paste the key, name it "Hostinger server", and leave "Allow write access" **off**. Then:

```
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
EOF
git clone git@github.com:lydiaberry-260901/READ-ME.git ~/moca-crm
cd ~/moca-crm
```

## 6. Settings

```
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in every setting (the README explains each one). For the live site:

* `DATABASE_URL="postgresql://moca:THE_DB_PASSWORD@localhost:5432/moca_crm?schema=public"`
* `APP_URL` and `AUTH_URL`: `https://crm.moca.energy`
* `AUTH_TRUST_HOST="true"`
* `FIRST_ADMIN_EMAIL`: the work email of the person who will set the CRM up. Only they can create the organisation.
* `DEV_LOGIN_ENABLED="false"`, and leave `EMAIL_TRANSPORT` empty.
* Remove `TEST_DATABASE_URL` and `SEED_ADMIN_EMAIL`. **Never run the demo data on the live site.**
* New random keys, one each (never reuse the development ones):

```
npx --yes auth secret                # for AUTH_SECRET
openssl rand -base64 32              # for ENCRYPTION_KEY
openssl rand -base64 32              # for SUPPRESSION_HMAC_KEY (a different value)
```

Keep a copy of `ENCRYPTION_KEY` and `SUPPRESSION_HMAC_KEY` in Moca's password manager. Without them, stored email and calendar connections and the do not contact list cannot be read after a rebuild.

Check the settings:

```
NODE_ENV=production npm run check:env
```

It lists anything that must be fixed (it runs again automatically on every deploy).

## 7. Backups

Create the passphrase that encrypts the backups, and keep a copy in the password manager. **Without it, backups cannot be restored.**

```
openssl rand -base64 32 > ~/.backup-passphrase
chmod 600 ~/.backup-passphrase
```

Back up every night at 02:30:

```
crontab -e
```

and add:

```
30 2 * * * cd /home/moca/moca-crm && bash deploy/backup.sh >> /home/moca/backups/backup.log 2>&1
```

Backups are kept in `~/backups` for 14 days, encrypted. A copy should also be kept **off the server** (for example downloaded regularly to Moca's secure storage), so a problem with the server does not lose both:

```
scp moca@203.0.113.10:/home/moca/backups/moca-crm_*.dump.gpg ./
```

Test a restore once before relying on it (see section 12).

## 8. First deploy

```
cd ~/moca-crm
bash deploy/deploy.sh
pm2 startup systemd     # then run the command it prints, so the CRM starts after a reboot
pm2 save
```

The deploy script gets the newest code, installs packages, checks the settings, takes a backup, updates the database, builds the app, and starts the web app and the worker. It ends by checking `/api/health`.

## 9. The web server and HTTPS

```
sudo cp deploy/moca-proxy.conf /etc/nginx/snippets/moca-proxy.conf
sudo cp deploy/nginx.conf /etc/nginx/sites-available/moca-crm
sudo nano /etc/nginx/sites-available/moca-crm        # change crm.moca.energy if needed
sudo ln -s /etc/nginx/sites-available/moca-crm /etc/nginx/sites-enabled/moca-crm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d crm.moca.energy --redirect -m your.name@moca.energy --agree-tos
```

Certbot gets a free certificate, sends all visitors to HTTPS, and renews the certificate automatically. Check renewal works with `sudo certbot renew --dry-run`.

## 10. Sign in services

* **Google Cloud Console**, Credentials, the OAuth client: add `https://crm.moca.energy/api/auth/callback/google` and `https://crm.moca.energy/api/connect/callback/google`.
* **Microsoft Entra**, the app registration, Authentication: add `https://crm.moca.energy/api/auth/callback/microsoft-entra-id` and `https://crm.moca.energy/api/connect/callback/microsoft`. Set `AUTH_MICROSOFT_ENTRA_ID_ISSUER` to `https://login.microsoftonline.com/<Moca's tenant id>/v2.0`.

After changing `.env`, run `bash deploy/deploy.sh` again.

## 11. First sign in

1. The person in `FIRST_ADMIN_EMAIL` opens `https://crm.moca.energy` and signs in. The organisation is created and they become the admin.
2. They set up **two step sign in** with an authenticator app, and save the recovery codes in a password manager.
3. In the account menu: Organisation (legal name, address, privacy notice link), People and teams (invite everyone), Deal stages, News settings, and the **Privacy centre**: name the data protection lead and work through the go live checklist.
4. Install the starter outreach library if wanted: `npm run outreach:starter` on the server.

## 12. Everyday running

* **Updating to a new version:** `cd ~/moca-crm && bash deploy/deploy.sh`
* **Is it running?** `pm2 status`, and `https://crm.moca.energy/api/health` should say `"ok":true`.
* **Logs:** `pm2 logs moca-web` and `pm2 logs moca-worker` (they hold no passwords or keys).
* **Restoring a backup** (replaces everything in the database):

```
pm2 stop all
bash deploy/restore.sh ~/backups/moca-crm_2026-09-29_0230.dump.gpg
pm2 start all
```

* **An admin lost their phone:** another admin resets their two step sign in under People and teams. If there is no other admin: `npm run twostep:reset -- their.email@moca.energy` on the server.
* **Server updates:** security updates install automatically. Once a month, `sudo apt update && sudo apt upgrade -y`, and reboot if asked.

## 13. Security summary

* Only ports 22 (SSH, keys only), 80 and 443 are open. The app and database only listen on the server itself.
* All traffic is HTTPS, with strict security headers and a Content Security Policy.
* Sign in is by Google or Microsoft work account and invitation only; admins and the data protection lead also need two step sign in.
* Secrets live only in `.env` (readable by the app user only) and Moca's password manager, never in GitHub.
* Nightly encrypted backups, kept for 14 days, with a copy off the server.
* Nginx and the app both limit how fast anyone can try to sign in or send data.
