(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.TeamPeachBrandProtection=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const COMPOUND_SUFFIXES=new Set([
    "co.uk","org.uk","ac.uk","gov.uk","com.au","net.au","org.au","edu.au",
    "co.nz","org.nz","com.ng","co.ng","org.ng","net.ng","gov.ng","edu.ng",
    "co.za","org.za","com.br","com.mx","com.sg","com.my","com.ph","com.in",
    "co.in","firm.in","net.in","org.in","co.jp","co.kr","com.tr"
  ]);
  const CREDENTIAL_TERMS=[
    "login","logon","signin","sign-in","account","accounts","secure","security",
    "verify","verification","password","wallet","payment","billing","auth",
    "authenticate","confirm","recovery","support","helpdesk","customer"
  ];
  const CONFUSABLES={"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","8":"b"};

  function normalizeName(value){
    return String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  }

  function normalizeHost(value){
    let raw=String(value||"").trim().toLowerCase();
    if(!raw)return "";
    raw=raw.replace(/^https?:\/\//,"").replace(/^www\./,"").split(/[/?#]/,1)[0].split(":",1)[0].replace(/\.$/,"");
    return /^[a-z0-9.-]+$/.test(raw)&&raw.includes(".")?raw:"";
  }

  function getRegistrableLabel(value){
    const host=normalizeHost(value);
    if(!host)return "";
    const labels=host.split(".").filter(Boolean);
    if(labels.length<2)return "";
    const suffix2=labels.slice(-2).join(".");
    const nameLabels=COMPOUND_SUFFIXES.has(suffix2)?labels.slice(0,-2):labels.slice(0,-1);
    return nameLabels.filter(label=>label!=="www").join("");
  }

  function confusableName(value){
    return normalizeName(value).replace(/[0134578]/g,char=>CONFUSABLES[char]||char);
  }

  function damerauLevenshtein(left,right,limit){
    if(left===right)return 0;
    if(Math.abs(left.length-right.length)>limit)return limit+1;
    const rows=left.length+1,cols=right.length+1;
    const matrix=Array.from({length:rows},()=>new Uint16Array(cols));
    for(let i=0;i<rows;i++)matrix[i][0]=i;
    for(let j=0;j<cols;j++)matrix[0][j]=j;
    for(let i=1;i<rows;i++){
      let rowMin=limit+1;
      for(let j=1;j<cols;j++){
        const cost=left[i-1]===right[j-1]?0:1;
        let value=Math.min(
          matrix[i-1][j]+1,
          matrix[i][j-1]+1,
          matrix[i-1][j-1]+cost
        );
        if(i>1&&j>1&&left[i-1]===right[j-2]&&left[i-2]===right[j-1]){
          value=Math.min(value,matrix[i-2][j-2]+1);
        }
        matrix[i][j]=value;
        if(value<rowMin)rowMin=value;
      }
      if(rowMin>limit)return limit+1;
    }
    return matrix[left.length][right.length];
  }

  function hasCredentialSignal(candidate,brand){
    const remainder=candidate.replace(brand,"");
    const tokens=remainder.split(/[^a-z0-9]+/).filter(Boolean);
    const compact=normalizeName(remainder);
    return CREDENTIAL_TERMS.some(term=>tokens.includes(term)||compact.includes(term));
  }

  function isOfficialDomain(domain,officialDomain){
    const official=normalizeHost(officialDomain);
    const host=normalizeHost(domain);
    return Boolean(official&&host&&(host===official||host.endsWith("."+official)));
  }

  function analyseDomain(domain,watchlist){
    const host=normalizeHost(domain);
    if(!host||!Array.isArray(watchlist)||!watchlist.length)return [];
    const candidate=getRegistrableLabel(host);
    const candidateName=normalizeName(candidate);
    if(candidateName.length<4)return [];
    const candidateVisual=confusableName(candidate);
    const results=[];

    for(const item of watchlist){
      const brand=normalizeName(item&&item.name);
      if(brand.length<4||isOfficialDomain(host,item.officialDomain))continue;
      let matchType="",priority="",score=0,reason="",distance=null;
      const credential=hasCredentialSignal(candidate,brand);

      if(candidateName===brand){
        matchType="Exact brand-name match";
        priority="Review";
        score=78;
        reason="The domain's main name matches the protected brand name. Confirm whether it is an authorised domain.";
      }else if(candidateName.includes(brand)&&candidateName.length-brand.length<=16){
        matchType="Brand name with extra wording";
        priority=credential?"High priority":"Possible";
        score=credential?98:88;
        reason=credential
          ?"The brand name is combined with wording often used around account access, verification or payments."
          :"The brand name appears inside a longer domain name. It may be legitimate or unrelated; review the registrant and website independently.";
      }else{
        const maxDistance=brand.length>=8?2:1;
        if(candidateName.length>=4&&candidateName.length<=brand.length+maxDistance&&candidateName.length>=brand.length-maxDistance){
          distance=damerauLevenshtein(candidateName,brand,maxDistance);
        }
        if(candidateVisual!==candidateName&&damerauLevenshtein(candidateVisual,brand,1)<=1){
          matchType="Possible character substitution";
          priority=credential?"High priority":"Possible";
          score=credential?99:94;
          reason="The name uses a digit or lookalike character in a way that resembles the protected brand.";
        }else if(distance!==null&&distance<=maxDistance){
          matchType="Possible spelling variation";
          priority=credential?"High priority":distance===1?"High priority":"Possible";
          score=credential?99:distance===1?94:84;
          reason=distance===1
            ?"The domain name differs from the protected brand by one character or a transposition."
            :"The domain name is within two character changes of the protected brand.";
          if(credential)reason+=" It also contains wording associated with account access or verification.";
        }
      }

      if(matchType){
        results.push({
          brand:String(item.name||""),
          brandKey:brand,
          domain:host,
          matchType,
          priority,
          score,
          distance,
          reason,
          credentialSignal:credential
        });
      }
    }
    return results.sort((a,b)=>b.score-a.score||a.brand.localeCompare(b.brand));
  }

  function prepareBrand(name,officialDomain){
    const cleanName=String(name||"").trim().replace(/\s+/g," ");
    const normalized=normalizeName(cleanName);
    if(cleanName.length<2||normalized.length<4)throw new Error("Use a brand name with at least four letters or numbers.");
    if(cleanName.length>70)throw new Error("Brand names must be 70 characters or fewer.");
    const official=normalizeHost(officialDomain);
    if(officialDomain&&!official)throw new Error("Enter a valid official website, such as example.com.");
    return{name:cleanName,normalized,officialDomain:official};
  }

  return{
    normalizeName,
    normalizeHost,
    getRegistrableLabel,
    damerauLevenshtein,
    analyseDomain,
    prepareBrand,
    isOfficialDomain
  };
});
