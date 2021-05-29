const { program } = require('commander');
const action = require('./action');

program.version(process.env.npm_package_version);

program
    .command('start')
    .description('开始查找gpg靓号')
    .option('-b, --barkid <backid>', '指定通知使用的barkid')
    .action((options)=>{
        action.generate(options.barkid);
    });

program
    .command('list [suffix]')
    .description('显示已经保存的数据')
    .action((suffix)=>{
        action.list(suffix);
    });

program
    .command('import <suffix>')
    .description('导入靓号结果到gpg中')
    .option('-n, --name <name>', '指定uid.name', 'auto_generate')
    .option('-e, --email <email>', '指定uid.email')
    .option('-m, --comment <comment>', '指定uid.comment')
    .action((suffix, options)=>{
        action.import(suffix, {name: options.name, email: options.email, comment: options.comment});
    });

program.parse();