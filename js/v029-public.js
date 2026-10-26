/* v0.2.9 – highlight.js theme + corrected legacy download icons */
(() => {
 const allowed=['atom-one-dark','github-dark','vs2015','monokai-sublime','stackoverflow-dark','night-owl'];
 const theme=()=>typeof siteConfig!=='undefined' ? siteConfig?.codeTheme : window.siteConfig?.codeTheme;
 let last='';
 const applyTheme=()=>{let value=theme()||'atom-one-dark';if(!allowed.includes(value))value='atom-one-dark';if(value!==last){last=value;const el=document.getElementById('elt-hljs-theme');if(el)el.href=`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${value}.min.css`}};
 const adjust=(node)=>{
   if(!node||node.nodeType!==1)return;
   const cards=[...(node.matches?.('.md-download-box')?[node]:[]),...(node.querySelectorAll?.('.md-download-box')||[])];
   cards.forEach(card=>{
     const old=card.querySelector('.md-dl-icon');
     if(old&&(/google-drive|drive/.test(old.className)))old.style.color='#34a853';
     const legacy=card.querySelector('.elt28-dl-brand .elt28-si');
     if(legacy && /\/files\//i.test(legacy.getAttribute('style')||'')){
       legacy.outerHTML='<i class="ri-file-zip-line" style="font-size:34px;color:#d7e5f2"></i>';
     }
     const s=card.querySelector('.md-dl-size i');if(s)s.className='ri-hard-drive-3-fill';
   });
   applyTheme();
 };
 const root=document.getElementById('app-content');
 if(root){const observer=new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes)adjust(n)});observer.observe(root,{subtree:true,childList:true});adjust(root)}
 document.addEventListener('DOMContentLoaded',()=>{applyTheme();adjust(document.getElementById('app-content'))});
})();
