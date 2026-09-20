use anyhow::{bail, Context, Result};
use omni_vpn::{
    encode_key,
    knock::{Action, SignedAck, SignedRequest},
};
use std::{
    collections::HashMap,
    fs,
    net::{SocketAddr, UdpSocket},
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn options() -> Result<(String, HashMap<String, String>)> {
    let mut args = std::env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "help".into());
    let mut flags = HashMap::new();
    while let Some(flag) = args.next() {
        if !flag.starts_with("--") {
            bail!("expected option, got {flag}");
        }
        let value = args
            .next()
            .with_context(|| format!("missing value for {flag}"))?;
        if flags.insert(flag, value).is_some() {
            bail!("duplicate option");
        }
    }
    Ok((command, flags))
}
fn required<'a>(flags: &'a HashMap<String, String>, name: &str) -> Result<&'a str> {
    flags
        .get(name)
        .map(String::as_str)
        .with_context(|| format!("missing {name}"))
}
fn now() -> Result<u64> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs())
}
fn main() -> Result<()> {
    let (command, flags) = options()?;
    let allowed: &[&str] = match command.as_str() {
        "simulate" => &["--clients", "--rounds", "--provider-urls", "--output"],
        "knock" => &["--endpoint", "--client-id", "--secret-file", "--epoch"],
        "knock-server" => &["--bind", "--clients", "--state", "--interface"],
        "keygen" | "help" | "--help" => &[],
        _ => bail!("unknown command; run omni-vpn help"),
    };
    for option in flags.keys() {
        if !allowed.contains(&option.as_str()) {
            bail!("unsupported option for {command}: {option}");
        }
    }
    match command.as_str() {
        "simulate"=>{
            let clients=flags.get("--clients").map(|s|s.parse()).transpose()?.unwrap_or(6);
            let rounds=flags.get("--rounds").map(|s|s.parse()).transpose()?.unwrap_or(3);
            let providers=flags.get("--provider-urls").map(|s|s.split(',').map(str::to_owned).collect()).unwrap_or_default();
            let report=omni_vpn::simulation::run(clients,rounds,providers)?;
            let encoded=serde_json::to_vec_pretty(&report)?;
            if let Some(output)=flags.get("--output") {
                let path=Path::new(output); if let Some(parent)=path.parent().filter(|p|!p.as_os_str().is_empty()){fs::create_dir_all(parent)?;}
                fs::write(path,&encoded)?;
                println!("{}",serde_json::json!({"simulation":true,"passed":report.passed,"clients":clients,"rounds":rounds,"report":output}));
            } else { println!("{}",String::from_utf8(encoded)?); }
        }
        "keygen"=>{
            let key=omni_vpn::rotation::KeyEpoch::fresh(0);
            println!("{}",serde_json::json!({"private_key":encode_key(&key.private),"public_key":encode_key(&key.public),"knock_secret":encode_key(&omni_vpn::random_key())}));
        }
        "knock"=>{
            let secret=omni_vpn::decode_key(&fs::read_to_string(required(&flags,"--secret-file")?)?)?;
            let id=required(&flags,"--client-id")?;
            let endpoint:SocketAddr=required(&flags,"--endpoint")?.parse().context("use a resolved IP:port for knock endpoint")?;
            let epoch=flags.get("--epoch").map(|s|s.parse()).transpose()?.unwrap_or(0);
            let timestamp=now()?;
            let signed=SignedRequest::new(id,&secret,timestamp,Action::Open,epoch,None)?;
            let socket=UdpSocket::bind(if endpoint.is_ipv4(){"0.0.0.0:0"}else{"[::]:0"})?;
            socket.connect(endpoint)?;socket.set_read_timeout(Some(Duration::from_secs(3)))?;
            socket.send(&signed.to_bytes()?)?;
            let mut buffer=[0;2048];let count=socket.recv(&mut buffer)?;
            let ack:SignedAck=serde_json::from_slice(&buffer[..count])?;
            ack.verify(&signed.request,&secret,now()?)?;
            println!("{}",serde_json::json!({"admitted":true,"expires_at":ack.ack.expires_at}));
        }
        "knock-server"=>omni_vpn::server::run(
            required(&flags,"--bind")?,required(&flags,"--clients")?,required(&flags,"--state")?,
            flags.get("--interface").map(String::as_str).unwrap_or("omni0"))?,
        "help"|"--help"=>println!("omni-vpn simulate --clients 6 --rounds 3 [--provider-urls http://127.0.0.1:4101,http://127.0.0.1:4102] [--output report.json]\nomni-vpn keygen\nomni-vpn knock --endpoint IP:PORT --client-id ID --secret-file PATH [--epoch N]\nomni-vpn knock-server --bind IP:PORT --clients PATH --state PATH [--interface omni0]"),
        _=>bail!("unknown command; run omni-vpn help"),
    }
    Ok(())
}
