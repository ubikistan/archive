(function(){
  var b=document.getElementById('copy'),p=document.getElementById('dropcard');
  if(!b||!p)return;
  b.addEventListener('click',function(){
    var t=p.textContent;
    function sel(){var r=document.createRange();r.selectNodeContents(p);var s=window.getSelection();s.removeAllRanges();s.addRange(r);b.textContent='Selected';}
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1600)},sel);
    }else{sel();}
  });
})();
