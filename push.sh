vercel && vercel --prod 
git add .

if [ $1 ]; then
    echo "\n\n commit $1 \n\n"
    git commit -m "$1"
  else
    echo "\n\n commit is random \n\n"
    git commit -m "$RANDOM"
fi
git push -u origin master
npm run build
