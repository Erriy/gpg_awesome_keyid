const openpgp = require('openpgp');
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const os = require('os');
const fs = require('fs');
const path = require('path');
const {fork} = require('child_process');
const axios = require('axios').default;
const gpg = require('gpg');
const util = require('util');
const gpg_import = util.promisify(gpg.importKey);
const rule = require('./rule');

const dbs_path = path.join(__dirname, '../dbs');

async function gen_basic_key () {
    const { privateKeyArmored } = await openpgp.generateKey({
        type   : 'ecc', // Type of the key, defaults to ECC
        curve  : 'curve25519', // ECC curve name, defaults to curve25519
        userIDs: [{name: 't'}]
    });
    return await openpgp.readKey({ armoredKey: privateKeyArmored });
}

async function notify_with_bark (barkid, fingerprint) {
    if(barkid) {
        await axios.get(`https://api.day.app/${barkid}/gpg_awesome_key/${fingerprint}`);
    }
}

async function do_generate (db_path, barkid) {
    let db = await sqlite.open({
        filename: db_path,
        driver  : sqlite3.Database
    });
    await db.run(`create table if not exists key(
        fpr text not null,
        key text not null
    )`);
    let prikey = null;
    let start = new Date();

    for(let index = 0; ; index++) {
        if(0 === index % 10000) {
            prikey = await gen_basic_key();
            const time_shift = (new Date() - start) / 1000;
            const count = (await db.get('select count(*) from key'))['count(*)'];
            console.log(`[${db_path}] 耗时${time_shift}秒，已计算key${index}个，数据库中已保存${count}个key`);
        }
        // 修改key的创建时间并重新计算指纹
        // ! 需要注意的是，此时的key的subkey和uid的签名都是需要修正的，是原始指纹的key的签名
        prikey.keyPacket.created = new Date(prikey.keyPacket.created.getTime() - 1000);
        let r = {
            // ! 注意此处必须使用public key的指纹，private key的指纹并没有重新计算
            fpr: prikey.toPublic().getFingerprint(),
            key: prikey.armor()
        };
        // 仅保存或发送提醒
        const save = rule.save(r.fpr);
        const notify = rule.notify(r.fpr);
        if(save || notify) {
            await (await db.prepare('insert into key(fpr,key) values(?,?)')).run(r.fpr, r.key);
        }
        if(notify) {
            await notify_with_bark(barkid, r.fpr);
        }
    }
}

function list (suffix, cb) {
    fs.readdir(dbs_path,function (err,files){
        if(err){
            console.warn(err);
            return;
        }
        files.forEach(async dbname=>{
            let db_path = path.join(dbs_path, dbname);
            if(!db_path.endsWith('.db' )) {
                return;
            }
            let db = await sqlite.open({
                filename: db_path,
                driver  : sqlite3.Database
            });
            db.each('select * from key', (e,k)=>{
                let keyid = k.fpr.slice(24);
                if(
                    (suffix && k.fpr.toLowerCase().endsWith(suffix.toLowerCase()))
                    ||
                    !suffix
                ) {
                    if(cb) {
                        cb(k.key);
                    }
                    else {
                        console.log(`${k.fpr} => ${keyid.slice(0,4)} ${keyid.slice(4,8)} ${keyid.slice(8,12)} ${keyid.slice(12,16)}`);
                    }
                }
            });
        });
    });
}

function _import (suffix, uid = {name: undefined, email: undefined, comment: undefined}) {
    console.error(`注意：导入的key并未设置密码，请自行使用命令设置密码，数据库中存在明文key，记得删除，防止泄漏
gpg --edit-key <keyid>
passwd
`);
    list(suffix, async key=>{
        let prikey = await openpgp.readKey({armoredKey: key});
        let nk = await openpgp.reformatKey({privateKey: prikey, userIDs: [uid]});
        await gpg_import(nk.privateKeyArmored);
        console.log(`已导入key[${nk.key.getFingerprint()}]`);
    });
}

function generate (barkid) {
    try {
        fs.mkdirSync(dbs_path);
    }catch(e) {}
    const process_count = os.cpus().length;
    for(let i = 0; i < process_count; i++) {
        fork(
            __filename,
            [path.join(dbs_path, `key${i}.db`), barkid]
        );
    }
}

if(require.main === module) {
    (async ()=>{
        await do_generate(process.argv[2], process.argv[3]);
    })();
}

module.exports = {
    generate,
    list,
    import: _import,
};