from PIL import Image
for name,box in [("card_remilia_0",(560,230,900,520)),("card_flandre_0.png",(700,220,1030,480))]:
    im=Image.open("tools/_shots/"+name+".png").crop(box)
    im=im.resize((im.width*3,im.height*3), Image.NEAREST)
    im.save("tools/_shots/_zoom_"+name.replace(".png","")+".png")
print("ok")