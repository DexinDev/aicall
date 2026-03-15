const RAW_ZIP_DATA = `
01431|Middlesex County, MA
01432|Middlesex County, MA
01450|Middlesex County, MA
01460|Middlesex County, MA
01463|Middlesex County, MA
01464|Middlesex County, MA
01469|Middlesex County, MA
01474|Middlesex County, MA
01701|Middlesex County, MA
01702|Middlesex County, MA
01718|Middlesex County, MA
01719|Middlesex County, MA
01720|Middlesex County, MA
01721|Middlesex County, MA
01730|Middlesex County, MA
01731|Middlesex County, MA
01741|Middlesex County, MA
01742|Middlesex County, MA
01746|Middlesex County, MA
01748|Middlesex County, MA
01749|Middlesex County, MA
01752|Middlesex County, MA
01754|Middlesex County, MA
01760|Middlesex County, MA
01770|Middlesex County, MA
01773|Middlesex County, MA
01775|Middlesex County, MA
01776|Middlesex County, MA
01778|Middlesex County, MA
01801|Middlesex County, MA
01803|Middlesex County, MA
01810|Essex County, MA
01821|Middlesex County, MA
01824|Middlesex County, MA
01826|Middlesex County, MA
01827|Middlesex County, MA
01830|Essex County, MA
01832|Essex County, MA
01833|Essex County, MA
01834|Essex County, MA
01835|Essex County, MA
01840|Essex County, MA
01841|Essex County, MA
01843|Essex County, MA
01844|Essex County, MA
01845|Essex County, MA
01850|Middlesex County, MA
01851|Middlesex County, MA
01852|Middlesex County, MA
01854|Middlesex County, MA
01860|Essex County, MA
01862|Middlesex County, MA
01863|Middlesex County, MA
01864|Middlesex County, MA
01867|Middlesex County, MA
01876|Middlesex County, MA
01879|Middlesex County, MA
01880|Middlesex County, MA
01886|Middlesex County, MA
01887|Middlesex County, MA
01890|Middlesex County, MA
01901|Essex County, MA
01902|Essex County, MA
01904|Essex County, MA
01905|Essex County, MA
01906|Essex County, MA
01907|Essex County, MA
01908|Essex County, MA
01913|Essex County, MA
01915|Essex County, MA
01921|Essex County, MA
01922|Essex County, MA
01923|Essex County, MA
01929|Essex County, MA
01930|Essex County, MA
01937|Essex County, MA
01938|Essex County, MA
01940|Essex County, MA
01944|Essex County, MA
01945|Essex County, MA
01949|Essex County, MA
01950|Essex County, MA
01951|Essex County, MA
01952|Essex County, MA
01960|Essex County, MA
01965|Essex County, MA
01966|Essex County, MA
01969|Essex County, MA
01970|Essex County, MA
01982|Essex County, MA
01983|Essex County, MA
01984|Essex County, MA
01985|Essex County, MA
02019|Norfolk County, MA
02021|Norfolk County, MA
02025|Norfolk County, MA
02026|Norfolk County, MA
02030|Norfolk County, MA
02032|Norfolk County, MA
02035|Norfolk County, MA
02038|Norfolk County, MA
02043|Plymouth County, MA
02045|Plymouth County, MA
02047|Plymouth County, MA
02050|Plymouth County, MA
02052|Norfolk County, MA
02053|Norfolk County, MA
02054|Norfolk County, MA
02056|Norfolk County, MA
02061|Plymouth County, MA
02062|Norfolk County, MA
02066|Plymouth County, MA
02067|Norfolk County, MA
02071|Norfolk County, MA
02072|Norfolk County, MA
02081|Norfolk County, MA
02090|Norfolk County, MA
02093|Norfolk County, MA
02108|Suffolk County, MA
02109|Suffolk County, MA
02110|Suffolk County, MA
02111|Suffolk County, MA
02113|Suffolk County, MA
02114|Suffolk County, MA
02115|Suffolk County, MA
02116|Suffolk County, MA
02118|Suffolk County, MA
02119|Suffolk County, MA
02120|Suffolk County, MA
02121|Suffolk County, MA
02122|Suffolk County, MA
02124|Suffolk County, MA
02125|Suffolk County, MA
02126|Suffolk County, MA
02127|Suffolk County, MA
02128|Suffolk County, MA
02129|Suffolk County, MA
02130|Suffolk County, MA
02131|Suffolk County, MA
02132|Suffolk County, MA
02133|Suffolk County, MA
02134|Suffolk County, MA
02135|Suffolk County, MA
02136|Suffolk County, MA
02138|Middlesex County, MA
02139|Middlesex County, MA
02140|Middlesex County, MA
02141|Middlesex County, MA
02142|Middlesex County, MA
02143|Middlesex County, MA
02144|Middlesex County, MA
02145|Middlesex County, MA
02148|Middlesex County, MA
02149|Middlesex County, MA
02150|Suffolk County, MA
02151|Suffolk County, MA
02152|Suffolk County, MA
02155|Middlesex County, MA
02163|Suffolk County, MA
02169|Norfolk County, MA
02170|Norfolk County, MA
02171|Norfolk County, MA
02176|Middlesex County, MA
02180|Middlesex County, MA
02184|Norfolk County, MA
02186|Norfolk County, MA
02188|Norfolk County, MA
02189|Norfolk County, MA
02190|Norfolk County, MA
02191|Norfolk County, MA
02199|Suffolk County, MA
02203|Suffolk County, MA
02205|Suffolk County, MA
02210|Suffolk County, MA
02215|Suffolk County, MA
02301|Plymouth County, MA
02302|Plymouth County, MA
02322|Norfolk County, MA
02324|Plymouth County, MA
02330|Plymouth County, MA
02332|Plymouth County, MA
02333|Plymouth County, MA
02338|Plymouth County, MA
02339|Plymouth County, MA
02341|Plymouth County, MA
02343|Norfolk County, MA
02346|Plymouth County, MA
02347|Plymouth County, MA
02350|Plymouth County, MA
02351|Plymouth County, MA
02359|Plymouth County, MA
02360|Plymouth County, MA
02364|Plymouth County, MA
02366|Plymouth County, MA
02367|Plymouth County, MA
02368|Norfolk County, MA
02370|Plymouth County, MA
02379|Plymouth County, MA
02382|Plymouth County, MA
02420|Middlesex County, MA
02421|Middlesex County, MA
02445|Norfolk County, MA
02446|Norfolk County, MA
02451|Middlesex County, MA
02452|Middlesex County, MA
02453|Middlesex County, MA
02457|Norfolk County, MA
02458|Middlesex County, MA
02459|Middlesex County, MA
02460|Middlesex County, MA
02461|Middlesex County, MA
02462|Middlesex County, MA
02464|Middlesex County, MA
02465|Middlesex County, MA
02466|Middlesex County, MA
02467|Norfolk County, MA
02468|Middlesex County, MA
02472|Middlesex County, MA
02474|Middlesex County, MA
02476|Middlesex County, MA
02478|Middlesex County, MA
02481|Norfolk County, MA
02482|Norfolk County, MA
02492|Norfolk County, MA
02493|Middlesex County, MA
02494|Norfolk County, MA
02538|Plymouth County, MA
02558|Plymouth County, MA
02571|Plymouth County, MA
02576|Plymouth County, MA
02738|Plymouth County, MA
02739|Plymouth County, MA
02762|Norfolk County, MA
02770|Plymouth County, MA
02802|Providence County, RI
02814|Providence County, RI
02816|Kent County, RI
02817|Kent County, RI
02818|Kent County, RI
02823|Providence County, RI
02824|Providence County, RI
02825|Providence County, RI
02826|Providence County, RI
02827|Kent County, RI
02828|Providence County, RI
02829|Providence County, RI
02830|Providence County, RI
02831|Providence County, RI
02835|Newport County, RI
02837|Newport County, RI
02838|Providence County, RI
02839|Providence County, RI
02840|Newport County, RI
02841|Newport County, RI
02842|Newport County, RI
02857|Providence County, RI
02859|Providence County, RI
02860|Providence County, RI
02861|Providence County, RI
02863|Providence County, RI
02864|Providence County, RI
02865|Providence County, RI
02871|Newport County, RI
02872|Newport County, RI
02876|Providence County, RI
02878|Newport County, RI
02886|Kent County, RI
02888|Kent County, RI
02889|Kent County, RI
02893|Kent County, RI
02895|Providence County, RI
02896|Providence County, RI
02903|Providence County, RI
02904|Providence County, RI
02905|Providence County, RI
02906|Providence County, RI
02907|Providence County, RI
02908|Providence County, RI
02909|Providence County, RI
02910|Providence County, RI
02911|Providence County, RI
02914|Providence County, RI
02915|Providence County, RI
02916|Providence County, RI
02917|Providence County, RI
02919|Providence County, RI
02920|Providence County, RI
02921|Providence County, RI
03032|Rockingham County, NH
03034|Rockingham County, NH
03036|Rockingham County, NH
03037|Rockingham County, NH
03038|Rockingham County, NH
03042|Rockingham County, NH
03044|Rockingham County, NH
03053|Rockingham County, NH
03077|Rockingham County, NH
03079|Rockingham County, NH
03087|Rockingham County, NH
03261|Rockingham County, NH
03290|Rockingham County, NH
03291|Rockingham County, NH
03801|Rockingham County, NH
03811|Rockingham County, NH
03819|Rockingham County, NH
03820|Strafford County, NH
03823|Strafford County, NH
03824|Strafford County, NH
03825|Strafford County, NH
03826|Rockingham County, NH
03827|Rockingham County, NH
03833|Rockingham County, NH
03835|Strafford County, NH
03839|Strafford County, NH
03840|Rockingham County, NH
03841|Rockingham County, NH
03842|Rockingham County, NH
03844|Rockingham County, NH
03848|Rockingham County, NH
03851|Strafford County, NH
03852|Strafford County, NH
03854|Rockingham County, NH
03855|Strafford County, NH
03856|Rockingham County, NH
03857|Rockingham County, NH
03858|Rockingham County, NH
03861|Strafford County, NH
03862|Rockingham County, NH
03865|Rockingham County, NH
03867|Strafford County, NH
03868|Strafford County, NH
03869|Strafford County, NH
03870|Rockingham County, NH
03871|Rockingham County, NH
03873|Rockingham County, NH
03874|Rockingham County, NH
03878|Strafford County, NH
03884|Strafford County, NH
03885|Rockingham County, NH
03887|Strafford County, NH
05033|Orange County, VT
05036|Orange County, VT
05038|Orange County, VT
05039|Orange County, VT
05040|Orange County, VT
05041|Orange County, VT
05043|Orange County, VT
05045|Orange County, VT
05051|Orange County, VT
05058|Orange County, VT
05060|Orange County, VT
05061|Orange County, VT
05069|Orange County, VT
05070|Orange County, VT
05072|Orange County, VT
05075|Orange County, VT
05076|Orange County, VT
05077|Orange County, VT
05079|Orange County, VT
05081|Orange County, VT
05083|Orange County, VT
05086|Orange County, VT
05442|Lamoille County, VT
05444|Lamoille County, VT
05464|Lamoille County, VT
05492|Lamoille County, VT
05602|Washington County, VT
05640|Washington County, VT
05641|Washington County, VT
05647|Washington County, VT
05648|Washington County, VT
05649|Orange County, VT
05650|Washington County, VT
05651|Washington County, VT
05652|Lamoille County, VT
05653|Lamoille County, VT
05654|Orange County, VT
05655|Lamoille County, VT
05656|Lamoille County, VT
05658|Washington County, VT
05660|Washington County, VT
05661|Lamoille County, VT
05663|Washington County, VT
05664|Washington County, VT
05666|Washington County, VT
05667|Washington County, VT
05669|Washington County, VT
05670|Washington County, VT
05672|Lamoille County, VT
05673|Washington County, VT
05674|Washington County, VT
05675|Orange County, VT
05676|Washington County, VT
05677|Washington County, VT
05678|Washington County, VT
05679|Orange County, VT
05680|Lamoille County, VT
05681|Washington County, VT
05682|Washington County, VT
07002|Hudson County, NJ
07003|Essex County, MA
07004|Essex County, MA
07006|Essex County, MA
07009|Essex County, MA
07010|Bergen County, NJ
07011|Passaic County, NJ
07012|Passaic County, NJ
07013|Passaic County, NJ
07014|Passaic County, NJ
07016|Union County, NJ
07017|Essex County, MA
07018|Essex County, MA
07020|Bergen County, NJ
07021|Essex County, MA
07022|Bergen County, NJ
07023|Union County, NJ
07024|Bergen County, NJ
07026|Bergen County, NJ
07027|Union County, NJ
07028|Essex County, MA
07029|Hudson County, NJ
07030|Hudson County, NJ
07031|Bergen County, NJ
07032|Hudson County, NJ
07033|Union County, NJ
07036|Union County, NJ
07039|Essex County, MA
07040|Essex County, MA
07041|Essex County, MA
07042|Essex County, MA
07043|Essex County, MA
07044|Essex County, MA
07047|Hudson County, NJ
07050|Essex County, MA
07052|Essex County, MA
07055|Passaic County, NJ
07057|Bergen County, NJ
07060|Union County, NJ
07062|Union County, NJ
07063|Union County, NJ
07065|Union County, NJ
07066|Union County, NJ
07068|Essex County, MA
07070|Bergen County, NJ
07071|Bergen County, NJ
07072|Bergen County, NJ
07073|Bergen County, NJ
07074|Bergen County, NJ
07075|Bergen County, NJ
07076|Union County, NJ
07078|Essex County, MA
07079|Essex County, MA
07081|Union County, NJ
07083|Union County, NJ
07086|Hudson County, NJ
07087|Hudson County, NJ
07088|Union County, NJ
07090|Union County, NJ
07092|Union County, NJ
07093|Hudson County, NJ
07094|Hudson County, NJ
07102|Essex County, MA
07103|Essex County, MA
07104|Essex County, MA
07105|Essex County, MA
07106|Essex County, MA
07107|Essex County, MA
07108|Essex County, MA
07109|Essex County, MA
07110|Essex County, MA
07111|Essex County, MA
07112|Essex County, MA
07114|Essex County, MA
07201|Union County, NJ
07202|Union County, NJ
07203|Union County, NJ
07204|Union County, NJ
07205|Union County, NJ
07206|Union County, NJ
07208|Union County, NJ
07302|Hudson County, NJ
07304|Hudson County, NJ
07305|Hudson County, NJ
07306|Hudson County, NJ
07307|Hudson County, NJ
07310|Hudson County, NJ
07311|Hudson County, NJ
07401|Bergen County, NJ
07403|Passaic County, NJ
07407|Bergen County, NJ
07410|Bergen County, NJ
07417|Bergen County, NJ
07420|Passaic County, NJ
07421|Passaic County, NJ
07423|Bergen County, NJ
07424|Passaic County, NJ
07430|Bergen County, NJ
07432|Bergen County, NJ
07435|Passaic County, NJ
07436|Bergen County, NJ
07442|Passaic County, NJ
07446|Bergen County, NJ
07450|Bergen County, NJ
07452|Bergen County, NJ
07456|Passaic County, NJ
07458|Bergen County, NJ
07463|Bergen County, NJ
07465|Passaic County, NJ
07470|Passaic County, NJ
07480|Passaic County, NJ
07481|Bergen County, NJ
07501|Passaic County, NJ
07502|Passaic County, NJ
07503|Passaic County, NJ
07504|Passaic County, NJ
07505|Passaic County, NJ
07506|Passaic County, NJ
07508|Passaic County, NJ
07512|Passaic County, NJ
07513|Passaic County, NJ
07514|Passaic County, NJ
07522|Passaic County, NJ
07524|Passaic County, NJ
07601|Bergen County, NJ
07603|Bergen County, NJ
07604|Bergen County, NJ
07605|Bergen County, NJ
07606|Bergen County, NJ
07607|Bergen County, NJ
07608|Bergen County, NJ
07620|Bergen County, NJ
07621|Bergen County, NJ
07624|Bergen County, NJ
07626|Bergen County, NJ
07627|Bergen County, NJ
07628|Bergen County, NJ
07630|Bergen County, NJ
07631|Bergen County, NJ
07632|Bergen County, NJ
07640|Bergen County, NJ
07641|Bergen County, NJ
07642|Bergen County, NJ
07643|Bergen County, NJ
07644|Bergen County, NJ
07645|Bergen County, NJ
07646|Bergen County, NJ
07647|Bergen County, NJ
07648|Bergen County, NJ
07649|Bergen County, NJ
07650|Bergen County, NJ
07652|Bergen County, NJ
07656|Bergen County, NJ
07657|Bergen County, NJ
07660|Bergen County, NJ
07661|Bergen County, NJ
07662|Bergen County, NJ
07663|Bergen County, NJ
07666|Bergen County, NJ
07670|Bergen County, NJ
07675|Bergen County, NJ
07676|Bergen County, NJ
07677|Bergen County, NJ
07901|Union County, NJ
07922|Union County, NJ
07974|Union County, NJ
20001|Washington, DC
20002|Washington, DC
20003|Washington, DC
20004|Washington, DC
20005|Washington, DC
20006|Washington, DC
20007|Washington, DC
20008|Washington, DC
20009|Washington, DC
20010|Washington, DC
20011|Washington, DC
20012|Washington, DC
20015|Washington, DC
20016|Washington, DC
20017|Washington, DC
20018|Washington, DC
20019|Washington, DC
20020|Washington, DC
20024|Washington, DC
20032|Washington, DC
20036|Washington, DC
20037|Washington, DC
20045|Washington, DC
20120|Fairfax County
20121|Fairfax County
20124|Fairfax County
20151|Fairfax County
20170|Fairfax County
20171|Fairfax County
20190|Fairfax County
20191|Fairfax County
20194|Fairfax County
20812|Montgomery County, MD
20814|Montgomery County, MD
20815|Montgomery County, MD
20816|Montgomery County, MD
20817|Montgomery County, MD
20818|Montgomery County, MD
20832|Montgomery County, MD
20833|Montgomery County, MD
20837|Montgomery County, MD
20838|Montgomery County, MD
20839|Montgomery County, MD
20841|Montgomery County, MD
20842|Montgomery County, MD
20850|Montgomery County, MD
20851|Montgomery County, MD
20852|Montgomery County, MD
20853|Montgomery County, MD
20854|Montgomery County, MD
20855|Montgomery County, MD
20860|Montgomery County, MD
20861|Montgomery County, MD
20862|Montgomery County, MD
20866|Montgomery County, MD
20868|Montgomery County, MD
20871|Montgomery County, MD
20872|Montgomery County, MD
20874|Montgomery County, MD
20876|Montgomery County, MD
20877|Montgomery County, MD
20878|Montgomery County, MD
20879|Montgomery County, MD
20880|Montgomery County, MD
20882|Montgomery County, MD
20886|Montgomery County, MD
20895|Montgomery County, MD
20896|Montgomery County, MD
20901|Montgomery County, MD
20902|Montgomery County, MD
20903|Montgomery County, MD
20904|Montgomery County, MD
20905|Montgomery County, MD
20906|Montgomery County, MD
20910|Montgomery County, MD
20912|Montgomery County, MD
22003|Fairfax County
22015|Fairfax County
22027|Fairfax County
22030|Fairfax County
22031|Fairfax County
22032|Fairfax County
22033|Fairfax County
22035|Fairfax County
22039|Fairfax County
22041|Fairfax County
22042|Fairfax County
22043|Fairfax County
22044|Fairfax County
22060|Fairfax County
22066|Fairfax County
22079|Fairfax County
22101|Fairfax County
22102|Fairfax County
22124|Fairfax County
22150|Fairfax County
22151|Fairfax County
22152|Fairfax County
22153|Fairfax County
22180|Fairfax County
22181|Fairfax County
22182|Fairfax County
22201|Arlington County
22202|Arlington County
22203|Arlington County
22204|Arlington County
22205|Arlington County
22206|Arlington County
22207|Arlington County
22209|Arlington County
22211|Arlington County
22213|Arlington County
22303|Fairfax County
22306|Fairfax County
22307|Fairfax County
22308|Fairfax County
22309|Fairfax County
22310|Fairfax County
22312|Fairfax County
22315|Fairfax County
33004|Broward County, FL
33009|Broward County, FL
33010|Miami-Dade County, FL
33012|Miami-Dade County, FL
33013|Miami-Dade County, FL
33014|Miami-Dade County, FL
33015|Miami-Dade County, FL
33016|Miami-Dade County, FL
33018|Miami-Dade County, FL
33019|Broward County, FL
33020|Broward County, FL
33021|Broward County, FL
33022|Broward County, FL
33023|Broward County, FL
33024|Broward County, FL
33025|Broward County, FL
33026|Broward County, FL
33027|Broward County, FL
33028|Broward County, FL
33029|Broward County, FL
33030|Miami-Dade County, FL
33031|Miami-Dade County, FL
33032|Miami-Dade County, FL
33033|Miami-Dade County, FL
33034|Miami-Dade County, FL
33035|Miami-Dade County, FL
33054|Miami-Dade County, FL
33055|Miami-Dade County, FL
33056|Miami-Dade County, FL
33060|Broward County, FL
33062|Broward County, FL
33063|Broward County, FL
33064|Broward County, FL
33065|Broward County, FL
33066|Broward County, FL
33067|Broward County, FL
33068|Broward County, FL
33069|Broward County, FL
33071|Broward County, FL
33073|Broward County, FL
33076|Broward County, FL
33101|Miami-Dade County, FL
33109|Miami-Dade County, FL
33122|Miami-Dade County, FL
33125|Miami-Dade County, FL
33126|Miami-Dade County, FL
33127|Miami-Dade County, FL
33128|Miami-Dade County, FL
33129|Miami-Dade County, FL
33130|Miami-Dade County, FL
33131|Miami-Dade County, FL
33132|Miami-Dade County, FL
33133|Miami-Dade County, FL
33134|Miami-Dade County, FL
33135|Miami-Dade County, FL
33136|Miami-Dade County, FL
33137|Miami-Dade County, FL
33138|Miami-Dade County, FL
33139|Miami-Dade County, FL
33140|Miami-Dade County, FL
33141|Miami-Dade County, FL
33142|Miami-Dade County, FL
33143|Miami-Dade County, FL
33144|Miami-Dade County, FL
33145|Miami-Dade County, FL
33146|Miami-Dade County, FL
33147|Miami-Dade County, FL
33149|Miami-Dade County, FL
33150|Miami-Dade County, FL
33154|Miami-Dade County, FL
33155|Miami-Dade County, FL
33156|Miami-Dade County, FL
33157|Miami-Dade County, FL
33158|Miami-Dade County, FL
33160|Miami-Dade County, FL
33161|Miami-Dade County, FL
33162|Miami-Dade County, FL
33165|Miami-Dade County, FL
33166|Miami-Dade County, FL
33167|Miami-Dade County, FL
33168|Miami-Dade County, FL
33169|Miami-Dade County, FL
33170|Miami-Dade County, FL
33172|Miami-Dade County, FL
33173|Miami-Dade County, FL
33174|Miami-Dade County, FL
33175|Miami-Dade County, FL
33176|Miami-Dade County, FL
33177|Miami-Dade County, FL
33178|Miami-Dade County, FL
33179|Miami-Dade County, FL
33180|Miami-Dade County, FL
33181|Miami-Dade County, FL
33182|Miami-Dade County, FL
33183|Miami-Dade County, FL
33184|Miami-Dade County, FL
33185|Miami-Dade County, FL
33186|Miami-Dade County, FL
33187|Miami-Dade County, FL
33189|Miami-Dade County, FL
33190|Miami-Dade County, FL
33193|Miami-Dade County, FL
33194|Miami-Dade County, FL
33196|Miami-Dade County, FL
33301|Broward County, FL
33304|Broward County, FL
33305|Broward County, FL
33306|Broward County, FL
33308|Broward County, FL
33309|Broward County, FL
33311|Broward County, FL
33312|Broward County, FL
33313|Broward County, FL
33314|Broward County, FL
33315|Broward County, FL
33316|Broward County, FL
33317|Broward County, FL
33319|Broward County, FL
33321|Broward County, FL
33322|Broward County, FL
33323|Broward County, FL
33324|Broward County, FL
33325|Broward County, FL
33326|Broward County, FL
33327|Broward County, FL
33328|Broward County, FL
33330|Broward County, FL
33331|Broward County, FL
33332|Broward County, FL
33334|Broward County, FL
33351|Broward County, FL
33388|Broward County, FL
33401|Palm Beach County, FL
33403|Palm Beach County, FL
33404|Palm Beach County, FL
33405|Palm Beach County, FL
33406|Palm Beach County, FL
33407|Palm Beach County, FL
33408|Palm Beach County, FL
33409|Palm Beach County, FL
33410|Palm Beach County, FL
33411|Palm Beach County, FL
33412|Palm Beach County, FL
33413|Palm Beach County, FL
33414|Palm Beach County, FL
33415|Palm Beach County, FL
33417|Palm Beach County, FL
33418|Palm Beach County, FL
33426|Palm Beach County, FL
33428|Palm Beach County, FL
33430|Palm Beach County, FL
33431|Palm Beach County, FL
33432|Palm Beach County, FL
33433|Palm Beach County, FL
33434|Palm Beach County, FL
33435|Palm Beach County, FL
33436|Palm Beach County, FL
33437|Palm Beach County, FL
33438|Martin County, FL
33441|Broward County, FL
33442|Broward County, FL
33444|Palm Beach County, FL
33445|Palm Beach County, FL
33446|Palm Beach County, FL
33449|Palm Beach County, FL
33455|Martin County, FL
33458|Palm Beach County, FL
33460|Palm Beach County, FL
33461|Palm Beach County, FL
33462|Palm Beach County, FL
33463|Palm Beach County, FL
33467|Palm Beach County, FL
33469|Martin County, FL
33470|Palm Beach County, FL
33472|Palm Beach County, FL
33473|Palm Beach County, FL
33476|Palm Beach County, FL
33477|Palm Beach County, FL
33478|Palm Beach County, FL
33480|Palm Beach County, FL
33483|Palm Beach County, FL
33484|Palm Beach County, FL
33486|Palm Beach County, FL
33487|Palm Beach County, FL
33493|Palm Beach County, FL
33496|Palm Beach County, FL
33498|Palm Beach County, FL
34956|Martin County, FL
34990|Martin County, FL
34994|Martin County, FL
34996|Martin County, FL
34997|Martin County, FL
94002|San Mateo County, CA
94005|San Mateo County, CA
94010|San Mateo County, CA
94014|San Mateo County, CA
94015|San Mateo County, CA
94018|San Mateo County, CA
94019|San Mateo County, CA
94020|San Mateo County, CA
94021|San Mateo County, CA
94022|Santa Clara County, CA
94024|Santa Clara County, CA
94025|San Mateo County, CA
94027|San Mateo County, CA
94028|San Mateo County, CA
94030|San Mateo County, CA
94037|San Mateo County, CA
94038|San Mateo County, CA
94040|Santa Clara County, CA
94041|Santa Clara County, CA
94043|Santa Clara County, CA
94044|San Mateo County, CA
94060|San Mateo County, CA
94061|San Mateo County, CA
94062|San Mateo County, CA
94063|San Mateo County, CA
94065|San Mateo County, CA
94066|San Mateo County, CA
94070|San Mateo County, CA
94074|San Mateo County, CA
94080|San Mateo County, CA
94085|Santa Clara County, CA
94086|Santa Clara County, CA
94087|Santa Clara County, CA
94089|Santa Clara County, CA
94102|San Francisco County, CA
94103|San Francisco County, CA
94104|San Francisco County, CA
94105|San Francisco County, CA
94107|San Francisco County, CA
94108|San Francisco County, CA
94109|San Francisco County, CA
94110|San Francisco County, CA
94111|San Francisco County, CA
94112|San Francisco County, CA
94114|San Francisco County, CA
94115|San Francisco County, CA
94116|San Francisco County, CA
94117|San Francisco County, CA
94118|San Francisco County, CA
94121|San Francisco County, CA
94122|San Francisco County, CA
94123|San Francisco County, CA
94124|San Francisco County, CA
94127|San Francisco County, CA
94128|San Mateo County, CA
94129|San Francisco County, CA
94130|San Francisco County, CA
94131|San Francisco County, CA
94132|San Francisco County, CA
94133|San Francisco County, CA
94134|San Francisco County, CA
94158|San Francisco County, CA
94188|San Francisco County, CA
94301|Santa Clara County, CA
94303|Santa Clara County, CA
94304|Santa Clara County, CA
94305|Santa Clara County, CA
94306|Santa Clara County, CA
94401|San Mateo County, CA
94402|San Mateo County, CA
94403|San Mateo County, CA
94404|San Mateo County, CA
94901|Marin County, CA
94903|Marin County, CA
94904|Marin County, CA
94920|Marin County, CA
94924|Marin County, CA
94925|Marin County, CA
94929|Marin County, CA
94930|Marin County, CA
94933|Marin County, CA
94937|Marin County, CA
94938|Marin County, CA
94939|Marin County, CA
94940|Marin County, CA
94941|Marin County, CA
94945|Marin County, CA
94946|Marin County, CA
94947|Marin County, CA
94949|Marin County, CA
94950|Marin County, CA
94952|Marin County, CA
94956|Marin County, CA
94957|Marin County, CA
94960|Marin County, CA
94963|Marin County, CA
94964|Marin County, CA
94965|Marin County, CA
94970|Marin County, CA
94971|Marin County, CA
94973|Marin County, CA
95002|Santa Clara County, CA
95008|Santa Clara County, CA
95013|Santa Clara County, CA
95014|Santa Clara County, CA
95020|Santa Clara County, CA
95030|Santa Clara County, CA
95032|Santa Clara County, CA
95035|Santa Clara County, CA
95037|Santa Clara County, CA
95046|Santa Clara County, CA
95050|Santa Clara County, CA
95051|Santa Clara County, CA
95054|Santa Clara County, CA
95070|Santa Clara County, CA
95110|Santa Clara County, CA
95111|Santa Clara County, CA
95112|Santa Clara County, CA
95113|Santa Clara County, CA
95116|Santa Clara County, CA
95117|Santa Clara County, CA
95118|Santa Clara County, CA
95119|Santa Clara County, CA
95120|Santa Clara County, CA
95121|Santa Clara County, CA
95122|Santa Clara County, CA
95123|Santa Clara County, CA
95124|Santa Clara County, CA
95125|Santa Clara County, CA
95126|Santa Clara County, CA
95127|Santa Clara County, CA
95128|Santa Clara County, CA
95129|Santa Clara County, CA
95130|Santa Clara County, CA
95131|Santa Clara County, CA
95132|Santa Clara County, CA
95133|Santa Clara County, CA
95134|Santa Clara County, CA
95135|Santa Clara County, CA
95136|Santa Clara County, CA
95138|Santa Clara County, CA
95139|Santa Clara County, CA
95140|Santa Clara County, CA
95148|Santa Clara County, CA
02325|Plymouth County, MA
02912|Providence County, RI
02918|Providence County, RI
20052|Washington, DC
20057|Washington, DC
20059|Washington, DC
20064|Washington, DC
20204|Washington, DC
20220|Washington, DC
20230|Washington, DC
20240|Washington, DC
20245|Washington, DC
20250|Washington, DC
20317|Washington, DC
20319|Washington, DC
20373|Washington, DC
20390|Washington, DC
20408|Washington, DC
20415|Washington, DC
20418|Washington, DC
20422|Washington, DC
20427|Washington, DC
20431|Washington, DC
20510|Washington, DC
20515|Washington, DC
20520|Washington, DC
20530|Washington, DC
20535|Washington, DC
20540|Washington, DC
20542|Washington, DC
20551|Washington, DC
20560|Washington, DC
20565|Washington, DC
20566|Washington, DC
20591|Washington, DC
20889|Montgomery County, MD
20892|Montgomery County, MD
20894|Montgomery County, MD
20899|Montgomery County, MD
33039|Miami-Dade County, FL
95053|Santa Clara County, CA
02815|Providence County, RI
02858|Providence County, RI
20260|Washington, DC
20388|Washington, DC
22214|Arlington County`;

const ZIP_TO_COUNTY = new Map();
for (const line of RAW_ZIP_DATA.trim().split('\n')) {
  const part = line.trim().split('|');
  if (part.length >= 2 && /^\d{5}$/.test(part[0])) {
    ZIP_TO_COUNTY.set(part[0], part[1].trim());
  }
}

/**
 * @param {string} zip - 5-digit ZIP
 * @returns {{ county: string | null, service_covered: boolean }}
 */
function lookupZip(zip) {
  if (!zip || String(zip).length !== 5) {
    return { county: null, service_covered: false };
  }
  const normalized = String(zip).padStart(5, '0');
  const county = ZIP_TO_COUNTY.get(normalized) || null;
  return {
    county,
    service_covered: county !== null
  };
}

export { lookupZip };
