# gpg_awesome_keyid

## 原理

根据rfc4880的pgp keyid的计算方式我们可以得知，修改key的创建时间我们即可以达到快速修改keyid的目的。

```
12.2.  Key IDs and Fingerprints
...
   a.3) low-order length octet of (b)-(e) (1 octet)
     b) version number = 4 (1 octet);
     c) timestamp of key creation (4 octets);
...
```

使用如下代码进行快速计算key

``` javascript
// src/actions.js@do_generate
let prikey = null;
let start = new Date();

for(let index = 0; ; index++) {
    if(0 === index % 10000) {
        // 每1万次之后重新生成key,防止创建时间过于小
        prikey = await gen_basic_key();
        // ...
    }
    // 修改key的创建时间并重新计算指纹（时间精度为秒）
    // ! 需要注意的是，此时的key的subkey和uid的签名都是需要修正的，是原始指纹的key的签名
    prikey.keyPacket.created = new Date(prikey.keyPacket.created.getTime() - 1000);
    let r = {
        // 因为修改了创建时间但是并未重新计算private key的指纹，但获取公钥时会重新计算公钥指纹，达到计算指纹的目的
        fpr: prikey.toPublic().getFingerprint(),
        // key需要修正，加密子钥和uid的签名都是使用的旧id进行签名的，import过程通过openpgp.reformat修正
        key: prikey.armor()
    };
    // ...
}
```

## 计算速度

### 测试环境

- os: gentoo linux
- kernel: 5.4.97
- cpu: Intel i5-5200U (4) @ 2.700GHz
- node: v14.16.1
- npm: 6.14.12

### 计算速度

``` shell
> node . start
...
[.../gpg_awesome_keyid/dbs/key2.db] 耗时57.582秒，已计算key250000个，数据库中已保存6个key
[.../gpg_awesome_keyid/dbs/key3.db] 耗时58.054秒，已计算key250000个，数据库中已保存6个key
[.../gpg_awesome_keyid/dbs/key1.db] 耗时58.213秒，已计算key250000个，数据库中已保存8个key
[.../gpg_awesome_keyid/dbs/key0.db] 耗时58.85秒，已计算key250000个，数据库中已保存5个key
```

### 预计8连keyid时间

每分钟100w数据

任意8连概率大约0xFFFFFFFF/16（16种可能）

通过计算：0xFFFFFFFF / 16 / 1000000 / 60 ≈ 4.47 小时


## 使用

### 安装

``` shell
git clone https://github.com/erriy/gpg_awesome_keyid.git \
&& cd gpg_awesome_keyid \
&& npm i
```

### 自定义靓号规则

```javascript
// src/rule.js 文件中
// notify和save函数任意一个返回true则保存，否则直接丢弃

/**
 * 返回true则保存数据库后并发送通知
 */
function notify (fingerprint) {
    // 默认提醒后八位相同的key
    return 1 === new Set(fingerprint.slice(32)).size;
}

/**
 * 返回true则保存到数据库
 */
function save (fingerprint) {
    const special_list = [
        '01234567',
        '76543210',
        'abcdef',
        '01020304',
        '11223344',
    ];

    if(
        new Set(fingerprint.slice(35)).size === 1
        || new Set(fingerprint.slice(32)).size <= 2
        || new Set(fingerprint.slice(24)).size <= 3
        || new Set(fingerprint).size <= 4
    ) {
        return true;
    }

    for(let s of special_list) {
        if(fingerprint.endsWith(s)){
            return true;
        }
    }

    return false;
}


```

### 修改gpg使用的算法

``` javascript
// src/action.js@gen_basic_key
// 推荐使用ecc算法，生成的公钥更小且计算速度更快
async function gen_basic_key () {
    const { privateKeyArmored } = await openpgp.generateKey({
        // 如果要修改算法，请自己去 https://github.com/openpgpjs/openpgpjs#performance 里面找
        type   : 'ecc',
        curve  : 'curve25519',
        userIDs: [{name: 't'}] // userid在导入时会重新生成，此处修改没有意义
    });
    return await openpgp.readKey({ armoredKey: privateKeyArmored });
}
```

### 开始算号

``` shell
# 直接开始算号
node . start
# 开始算号，发现帐号后发送bark通知
node . start --barkid xxxxxx
```

## 查找保存的数据

``` shell
# 列出所有数据
node . list 
# 列出指定后缀的数据
# node . list [suffix]
# 比如列出以fffff结尾的key
node . list fffff
```

### 保存结果

**注意：导入的key并未设置密码，请自行使用命令设置密码，数据库中存在明文key，记得删除，防止泄漏**

``` shell
# 保存以fffff结尾的key
node . import fffff
# 保存以fffff结尾的key并指定uid.name和uid.email
node . import fffff -n name -email test@test.com
```

## 其他更快速的方法

- [scallion](https://github.com/lachesis/scallion) ： 速度很快，但是只支持rsa算法，后9位9连大概在一分钟以内就能挖出，挖出的key无uid，可以通过openpgp.reformat 增加uid后再给gpg使用

## 相关资料

- [一位 PGP 进步青年的科学算号实践](https://www.douban.com/note/763978955/)
- [rfc4880](https://datatracker.ietf.org/doc/html/rfc4880)
- [openpgpjs](https://github.com/openpgpjs/openpgpjs)
