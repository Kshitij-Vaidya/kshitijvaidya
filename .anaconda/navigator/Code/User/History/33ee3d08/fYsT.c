#include <stdio.h>
#include <stdlib.h>
#include <math.h>
//1802B Codeforces: Settlement of Guinea Pigs
int main(void)
{
    //Accepting all data from the user
    int r; int n;
    int x;
    int N=0; //Number of guinea pigs added
    int A=0; //Number of aviaries
    int t=0; int p=0;
    printf("Enter number of data sets: ");
    scanf("%d\n",&r);
    for(int i=1;i<=r;i++)
    {
        A=0;
        printf("Enter no of days for which we need to plan : ");
        scanf("%d",&n);
        puts("");
        for(int j=0;j<n;j++)
        {
            scanf("%d  ",&x);
            if(x==1)
            N++;
            else if(x==2)
            {
                A+=(N/2+1);
                N=0;
            }
            printf("No of aviaries needed: %d\n",A);
        }
    }   
        
}


